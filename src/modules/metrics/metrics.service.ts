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
    ]);

    return {
      ventasMes: ventasMesAgg._sum.total ?? 0,
      ventasMesAnterior: ventasMesAnteriorAgg._sum.total ?? 0,
      pedidosActivos,
      productosDisponibles,
      clientesRegistrados,
      ultimosPedidos,
    };
  }
}
