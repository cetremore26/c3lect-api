import { Injectable } from '@nestjs/common';
import { EstadoPedido, EstadoPago } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const PERFUME_KEYWORDS = ['Lattafa', 'Afnan', 'Sahari', 'Zakat', 'Grandeur', 'Amaran'];

function clasificarModelo(modelo: string): 'reloj' | 'perfume' | 'accesorio' {
  if (modelo.includes('Organizador')) return 'accesorio';
  if (PERFUME_KEYWORDS.some((k) => modelo.includes(k))) return 'perfume';
  return 'reloj';
}

export function calcGananciaPorVenta(
  estado: string,
  precioVenta: number,
  costoProducto: number,
  costoEnvio: number,
  abono: number,
): number {
  if (precioVenta === 0) return -costoProducto; // Uso Personal
  const margen = precioVenta - costoProducto - costoEnvio;
  if (estado === 'Pagado') return margen;
  if (estado === 'Abonado' && precioVenta > 0) return Math.round((abono / precioVenta) * margen);
  return 0; // Pendiente
}

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

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
      todasLasVentas,
      totalPedidosHistoricos,
      totalComprasAgg,
      totalGastosAgg,
      ultimasVentasRaw,
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
      this.prisma.historicalSale.findMany({
        select: { modelo: true, precioVenta: true, costoProducto: true, costoEnvio: true, abono: true, estado: true, cliente: true, saldoPendiente: true },
      }),
      this.prisma.historicalSale.count(),
      this.prisma.purchase.aggregate({ _sum: { costoTotal: true } }),
      this.prisma.expense.aggregate({ _sum: { monto: true } }),
      this.prisma.historicalSale.findMany({ take: 5, orderBy: { fecha: 'desc' } }),
    ]);

    // Calcular métricas en JS a partir de los datos crudos
    let totalVendido = 0;
    let gananciaNeta = 0;
    let pendienteCobro = 0;
    const totalClientesSet = new Set<string>();
    const ventasPorCategoria = { reloj: 0, perfume: 0, accesorio: 0 };
    const conteoModelo: Record<string, { cantidad: number; total: number }> = {};

    for (const v of todasLasVentas) {
      totalVendido += v.abono - (v.precioVenta > 0 ? v.costoEnvio : 0);
      if (v.precioVenta > 0) pendienteCobro += v.saldoPendiente;
      gananciaNeta += calcGananciaPorVenta(v.estado, v.precioVenta, v.costoProducto, v.costoEnvio, v.abono);
      totalClientesSet.add(v.cliente);
      ventasPorCategoria[clasificarModelo(v.modelo)] += v.precioVenta;
      if (!conteoModelo[v.modelo]) conteoModelo[v.modelo] = { cantidad: 0, total: 0 };
      conteoModelo[v.modelo].cantidad += 1;
      conteoModelo[v.modelo].total += v.precioVenta;
    }

    const topProductos = Object.entries(conteoModelo)
      .sort((a, b) => b[1].cantidad - a[1].cantidad)
      .slice(0, 5)
      .map(([modelo, { cantidad, total }]) => ({ modelo, cantidad, total }));

    const totalCompras = totalComprasAgg._sum.costoTotal ?? 0;
    const totalGastos = totalGastosAgg._sum.monto ?? 0;
    const inventario = await this.prisma.inventarioMaestro.findMany({ select: { stock: true, costoUnitario: true } });
    const capitalInventario = inventario.reduce((s, i) => s + i.stock * i.costoUnitario, 0);

    const variacion = summary_variacion(ventasMesAgg._sum.total ?? 0, ventasMesAnteriorAgg._sum.total ?? 0);

    return {
      totalVendido,
      ventasMes: ventasMesAgg._sum.total ?? 0,
      ventasMesAnterior: ventasMesAnteriorAgg._sum.total ?? 0,
      variacionMes: variacion,
      pedidosActivos,
      totalPedidosHistoricos,
      productosDisponibles,
      clientesRegistrados,
      totalClientesHistoricos: totalClientesSet.size,
      totalCompras,
      totalGastos,
      capitalInventario,
      gananciaNeta,
      pendienteCobro,
      ultimosPedidos,
      ultimasVentas: ultimasVentasRaw,
      ventasPorCategoria,
      topProductos,
    };
  }

  async getFinancial() {
    const [ventas, comprasAgg, gastosAgg, inventario] = await Promise.all([
      this.prisma.historicalSale.findMany({
        select: { precioVenta: true, costoProducto: true, costoEnvio: true, abono: true, saldoPendiente: true, estado: true },
      }),
      this.prisma.purchase.aggregate({ _sum: { costoTotal: true } }),
      this.prisma.expense.aggregate({ _sum: { monto: true } }),
      this.prisma.inventarioMaestro.findMany({ select: { stock: true, costoUnitario: true } }),
    ]);

    let totalPrecioVentas = 0;
    let totalVendido = 0;
    let gananciaNetaVentas = 0;
    let pendienteCobro = 0;

    for (const v of ventas) {
      totalPrecioVentas += v.precioVenta;
      totalVendido += v.abono - (v.precioVenta > 0 ? v.costoEnvio : 0);
      if (v.precioVenta > 0) pendienteCobro += v.saldoPendiente;
      gananciaNetaVentas += calcGananciaPorVenta(v.estado, v.precioVenta, v.costoProducto, v.costoEnvio, v.abono);
    }

    const capitalInventario = inventario.reduce((s, i) => s + i.stock * i.costoUnitario, 0);
    const totalCompras = comprasAgg._sum.costoTotal ?? 0;
    const totalGastos = gastosAgg._sum.monto ?? 0;

    return {
      totalPrecioVentas,
      totalVendido,
      gananciaNetaVentas,
      pendienteCobro,
      totalCompras,
      capitalInventario,
      totalGastos,
      gananciaNeta: gananciaNetaVentas - totalGastos,
    };
  }

  async getSales(page: number, limit: number, desde?: string, hasta?: string, estado?: string, fuente?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    if (estado) where.estado = estado;
    if (fuente) where.fuente = fuente;

    const [data, total] = await Promise.all([
      this.prisma.historicalSale.findMany({ where, orderBy: { fecha: 'desc' }, skip, take: limit }),
      this.prisma.historicalSale.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getPurchases(page: number, limit: number, desde?: string, hasta?: string, categoria?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    if (categoria) where.categoria = categoria;

    const [data, total] = await Promise.all([
      this.prisma.purchase.findMany({ where, orderBy: { fecha: 'desc' }, skip, take: limit }),
      this.prisma.purchase.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }
}

function summary_variacion(mes: number, mesAnterior: number): number | null {
  if (mesAnterior === 0) return null;
  return ((mes - mesAnterior) / mesAnterior) * 100;
}
