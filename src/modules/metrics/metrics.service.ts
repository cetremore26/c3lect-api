import { Injectable } from '@nestjs/common';
import { EstadoPedido, EstadoPago, Rol } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
      // Historical
      totalVentasAgg,
      totalPedidosHistoricos,
      gananciaNeta,
      pendienteCobro,
      totalComprasAgg,
      totalGastosAgg,
      ultimasVentasRaw,
      ventasPorCategoriaRaw,
      topProductosRaw,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { total: true },
        where: { estado: EstadoPago.APROBADO, createdAt: { gte: inicioMes } },
      }),
      this.prisma.payment.aggregate({
        _sum: { total: true },
        where: {
          estado: EstadoPago.APROBADO,
          createdAt: { gte: inicioMesAnterior, lte: finMesAnterior },
        },
      }),
      this.prisma.order.count({
        where: {
          status: {
            in: [EstadoPedido.PENDIENTE, EstadoPedido.CONFIRMADO, EstadoPedido.EN_CAMINO],
          },
        },
      }),
      this.prisma.product.count({ where: { disponible: true } }),
      this.prisma.user.count({ where: { rol: Rol.CLIENTE } }),
      this.prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          shippingInfo: true,
          user: { select: { id: true, nombre: true, email: true } },
        },
      }),
      // Historical aggregates
      this.prisma.historicalSale.aggregate({ _sum: { precioVenta: true } }),
      this.prisma.historicalSale.count(),
      this.prisma.historicalSale.aggregate({ _sum: { gananciaNeta: true } }),
      this.prisma.historicalSale.aggregate({ _sum: { saldoPendiente: true } }),
      this.prisma.purchase.aggregate({ _sum: { costoTotal: true } }),
      this.prisma.expense.aggregate({ _sum: { monto: true } }),
      this.prisma.historicalSale.findMany({
        take: 5,
        orderBy: { fecha: 'desc' },
      }),
      this.prisma.historicalSale.groupBy({
        by: ['estilo'],
        _sum: { precioVenta: true },
        _count: { id: true },
      }),
      this.prisma.historicalSale.groupBy({
        by: ['modelo'],
        _sum: { precioVenta: true },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
    ]);

    const totalCompras = totalComprasAgg._sum.costoTotal ?? 0;
    const totalVentas = totalVentasAgg._sum.precioVenta ?? 0;
    const totalClientesHistoricos = await this.prisma.historicalSale
      .findMany({ distinct: ['cliente'], select: { cliente: true } })
      .then((r) => r.length);

    const ventasPorCategoria = { reloj: 0, perfume: 0, accesorio: 0 };
    for (const row of ventasPorCategoriaRaw) {
      const estiloLower = (row.estilo ?? '').toLowerCase();
      const total = row._sum.precioVenta ?? 0;
      if (estiloLower.includes('reloj')) ventasPorCategoria.reloj += total;
      else if (estiloLower.includes('perfume')) ventasPorCategoria.perfume += total;
      else ventasPorCategoria.accesorio += total;
    }

    const topProductos = topProductosRaw.map((r) => ({
      modelo: r.modelo,
      cantidad: r._count.id,
      total: r._sum.precioVenta ?? 0,
    }));

    return {
      totalVentas,
      ventasMes: ventasMesAgg._sum.total ?? 0,
      ventasMesAnterior: ventasMesAnteriorAgg._sum.total ?? 0,
      pedidosActivos,
      totalPedidosHistoricos,
      productosDisponibles,
      clientesRegistrados,
      totalClientesHistoricos,
      totalCompras,
      totalGastos: totalGastosAgg._sum.monto ?? 0,
      capitalInventario: totalCompras - (totalVentas - (gananciaNeta._sum.gananciaNeta ?? 0)),
      gananciaNeta: gananciaNeta._sum.gananciaNeta ?? 0,
      pendienteCobro: pendienteCobro._sum.saldoPendiente ?? 0,
      ultimosPedidos,
      ultimasVentas: ultimasVentasRaw,
      ventasPorCategoria,
      topProductos,
    };
  }

  async getFinancial() {
    const [ventasAgg, gananciaNeta, pendienteCobro, comprasAgg, gastosAgg] = await Promise.all([
      this.prisma.historicalSale.aggregate({
        _sum: { precioVenta: true },
      }),
      this.prisma.historicalSale.aggregate({
        _sum: { gananciaNeta: true },
      }),
      this.prisma.historicalSale.aggregate({
        _sum: { saldoPendiente: true },
      }),
      this.prisma.purchase.aggregate({
        _sum: { costoTotal: true },
      }),
      this.prisma.expense.aggregate({
        _sum: { monto: true },
      }),
    ]);

    const totalVendido = ventasAgg._sum.precioVenta ?? 0;
    const gananciaNetaVentas = gananciaNeta._sum.gananciaNeta ?? 0;
    const totalCompras = comprasAgg._sum.costoTotal ?? 0;
    const totalGastos = gastosAgg._sum.monto ?? 0;

    return {
      totalVendido,
      gananciaNetaVentas,
      pendienteCobro: pendienteCobro._sum.saldoPendiente ?? 0,
      totalCompras,
      capitalInventario: totalCompras - (totalVendido - gananciaNetaVentas),
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
      this.prisma.historicalSale.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip,
        take: limit,
      }),
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
      this.prisma.purchase.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
