import { Injectable } from '@nestjs/common';
import { Prisma, EstadoPedido, EstadoPago } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { categoriaDesdeCapitalizada, clasificarModelo, Categoria } from '../../common/categoria.util';

export function calcGananciaPorVenta(
  _estado: string,
  precioVenta: number,
  costoProducto: number,
  costoEnvio: number,
  abono: number,
): number {
  if (precioVenta === 0) return -costoProducto - costoEnvio;
  const margen = precioVenta - costoProducto - costoEnvio;
  return (Math.min(abono, precioVenta) / precioVenta) * margen;
}

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  // totalVendido/pendienteCobro/totalPrecioVentas son sumas lineales — se calculan
  // en la base de datos vía aggregate() en vez de cargar cada fila. gananciaNeta no
  // (ver sumarGananciaNeta): calcGananciaPorVenta es una fórmula condicional por fila,
  // no expresable como aggregate/groupBy sin SQL crudo.
  private async agregadosVentas() {
    const [totales, positivos] = await Promise.all([
      this.prisma.historicalSale.aggregate({ _sum: { abono: true, precioVenta: true } }),
      this.prisma.historicalSale.aggregate({
        where: { precioVenta: { gt: 0 } },
        _sum: { costoEnvio: true, saldoPendiente: true },
      }),
    ]);
    return {
      totalPrecioVentas: totales._sum.precioVenta ?? 0,
      totalVendido: (totales._sum.abono ?? 0) - (positivos._sum.costoEnvio ?? 0),
      pendienteCobro: positivos._sum.saldoPendiente ?? 0,
    };
  }

  private sumarGananciaNeta(
    rows: { estado: string; precioVenta: number; costoProducto: number; costoEnvio: number; abono: number }[],
  ): number {
    return rows.reduce(
      (sum, v) => sum + calcGananciaPorVenta(v.estado, v.precioVenta, v.costoProducto, v.costoEnvio, v.abono),
      0,
    );
  }

  async getSummary() {
    const now = new Date();
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
    const inicioMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const finMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      ventasMesAgg,
      ventasMesAnteriorAgg,
      pedidosActivos,
      productosDisponibles,
      clientesRegistrados,
      ultimosPedidos,
      ventasParaGanancia,
      clientesDistintos,
      topProductosRaw,
      totalPedidosHistoricos,
      totalComprasAgg,
      totalGastosAgg,
      ultimasVentasRaw,
      agregadosVentas,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { total: true },
        where: { estado: EstadoPago.APROBADO, createdAt: { gte: inicioMes } },
      }),
      this.prisma.payment.aggregate({
        _sum: { total: true },
        where: { estado: EstadoPago.APROBADO, createdAt: { gte: inicioMesAnterior, lte: finMesAnterior } },
      }),
      this.prisma.order.count({
        where: { status: { in: [EstadoPedido.PENDIENTE, EstadoPedido.CONFIRMADO, EstadoPedido.EN_CAMINO] } },
      }),
      this.prisma.product.count({ where: { disponible: true } }),
      this.prisma.user.count(),
      this.prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { items: true, shippingInfo: true, user: { select: { id: true, nombre: true, email: true } } },
      }),
      // Solo lo necesario para gananciaNeta (no expresable en SQL sin duplicar la
      // fórmula) y ventasPorCategoria (agrupa por una categoría calculada en JS
      // sobre texto libre, ver clasificarModelo — tampoco expresable vía groupBy).
      this.prisma.historicalSale.findMany({
        select: { modelo: true, precioVenta: true, costoProducto: true, costoEnvio: true, abono: true, estado: true },
      }),
      this.prisma.historicalSale.groupBy({ by: ['cliente'] }),
      this.prisma.historicalSale.groupBy({
        by: ['modelo'],
        _count: { modelo: true },
        _sum: { precioVenta: true },
        orderBy: { _count: { modelo: 'desc' } },
        take: 5,
      }),
      this.prisma.historicalSale.count(),
      this.prisma.purchase.aggregate({ _sum: { costoTotal: true } }),
      this.prisma.expense.aggregate({ _sum: { monto: true } }),
      this.prisma.historicalSale.findMany({ take: 5, orderBy: { fecha: 'desc' } }),
      this.agregadosVentas(),
    ]);

    const gananciaNeta = this.sumarGananciaNeta(ventasParaGanancia);

    const totalCompras = totalComprasAgg._sum.costoTotal ?? 0;
    const totalGastos = totalGastosAgg._sum.monto ?? 0;
    const inventario = await this.prisma.inventarioMaestro.findMany({
      select: { modelo: true, categoria: true, stock: true, costoUnitario: true },
    });
    const capitalInventario = inventario.reduce((s, i) => s + i.stock * i.costoUnitario, 0);

    // Categoría real desde InventarioMaestro (que ya la guarda), en vez de
    // adivinarla por palabras clave del modelo — solo se cae al heurístico de
    // clasificarModelo si la venta es de un modelo que ya no está en inventario.
    const categoriaPorModelo = new Map<string, Categoria>(
      inventario.map((i) => [i.modelo.toLowerCase(), categoriaDesdeCapitalizada(i.categoria)]),
    );
    const ventasPorCategoria = { reloj: 0, perfume: 0, accesorio: 0 };
    for (const v of ventasParaGanancia) {
      const cat = categoriaPorModelo.get(v.modelo.toLowerCase()) ?? clasificarModelo(v.modelo);
      ventasPorCategoria[cat] += v.precioVenta;
    }
    const topProductos = topProductosRaw.map((g) => ({
      modelo: g.modelo,
      cantidad: g._count.modelo,
      total: g._sum.precioVenta ?? 0,
    }));

    const variacion = summary_variacion(ventasMesAgg._sum.total ?? 0, ventasMesAnteriorAgg._sum.total ?? 0);

    return {
      totalVendido: agregadosVentas.totalVendido,
      ventasMes: ventasMesAgg._sum.total ?? 0,
      ventasMesAnterior: ventasMesAnteriorAgg._sum.total ?? 0,
      variacionMes: variacion,
      pedidosActivos,
      totalPedidosHistoricos,
      productosDisponibles,
      clientesRegistrados,
      totalClientesHistoricos: clientesDistintos.length,
      totalCompras,
      totalGastos,
      capitalInventario,
      gananciaNeta,
      pendienteCobro: agregadosVentas.pendienteCobro,
      ultimosPedidos,
      ultimasVentas: ultimasVentasRaw,
      ventasPorCategoria,
      topProductos,
    };
  }

  async getFinancial() {
    const [ventasParaGanancia, comprasAgg, gastosAgg, inventario, comprasCat, agregadosVentas] = await Promise.all([
      this.prisma.historicalSale.findMany({
        select: { precioVenta: true, costoProducto: true, costoEnvio: true, abono: true, estado: true },
      }),
      this.prisma.purchase.aggregate({ _sum: { costoTotal: true } }),
      this.prisma.expense.aggregate({ _sum: { monto: true } }),
      this.prisma.inventarioMaestro.findMany({ select: { stock: true, costoUnitario: true } }),
      this.prisma.purchase.groupBy({ by: ['categoria'], _sum: { costoTotal: true } }),
      this.agregadosVentas(),
    ]);

    const gananciaNetaVentas = this.sumarGananciaNeta(ventasParaGanancia);

    const capitalInventario = inventario.reduce((s, i) => s + i.stock * i.costoUnitario, 0);
    const totalCompras = comprasAgg._sum.costoTotal ?? 0;
    const totalGastos = gastosAgg._sum.monto ?? 0;

    const comprasPorCategoria: Record<string, number> = {};
    for (const g of comprasCat) {
      comprasPorCategoria[g.categoria] = g._sum.costoTotal ?? 0;
    }

    return {
      totalPrecioVentas: agregadosVentas.totalPrecioVentas,
      totalVendido: agregadosVentas.totalVendido,
      gananciaNetaVentas,
      pendienteCobro: agregadosVentas.pendienteCobro,
      totalCompras,
      comprasPorCategoria,
      capitalInventario,
      totalGastos,
      gananciaNeta: gananciaNetaVentas - totalGastos,
    };
  }

  async getSales(page = 1, limit = 20, desde?: string, hasta?: string, estado?: string, fuente?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.HistoricalSaleWhereInput = {};
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    if (estado) {
      const lista = estado.split(',').map((e) => e.trim()).filter(Boolean);
      where.estado = lista.length === 1 ? lista[0] : { in: lista };
    }
    if (fuente) where.fuente = fuente;

    const [raw, total] = await Promise.all([
      this.prisma.historicalSale.findMany({ where, orderBy: [{ fecha: 'desc' }, { id: 'asc' }], skip, take: limit }),
      this.prisma.historicalSale.count({ where }),
    ]);
    const data = raw.map((v) => ({
      ...v,
      gananciaNeta: calcGananciaPorVenta(v.estado, v.precioVenta, v.costoProducto, v.costoEnvio, v.abono),
      saldoPendiente: v.precioVenta > 0 ? Math.max(0, v.precioVenta - v.abono) : 0,
    }));
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getPurchases(page = 1, limit = 20, desde?: string, hasta?: string, categoria?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.PurchaseWhereInput = {};
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    if (categoria) where.categoria = categoria;

    const [data, total] = await Promise.all([
      this.prisma.purchase.findMany({ where, orderBy: [{ fecha: 'desc' }, { id: 'asc' }], skip, take: limit }),
      this.prisma.purchase.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}

function summary_variacion(mes: number, mesAnterior: number): number | null {
  if (mesAnterior === 0) return null;
  return ((mes - mesAnterior) / mesAnterior) * 100;
}
