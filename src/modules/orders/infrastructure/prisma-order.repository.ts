import { BadRequestException, Injectable } from '@nestjs/common';
import { EstadoPedido, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { deriveMarcaModeloFromProduct } from '../../../common/marca-modelo.util';
import { calcGananciaPorVenta } from '../../metrics/metrics.service';
import {
  CreatedOrder,
  NewConfirmedOrderData,
  NewOrderData,
  OrderDetail,
  OrderForPayment,
  OrderForStatusTransition,
  OrderListFilter,
  OrderListItem,
  OrderRepositoryPort,
} from '../application/ports/order-repository.port';
import { findInventarioByModelo } from './find-inventario-by-modelo';

const listInclude = {
  items: true,
  shippingInfo: true,
  user: { select: { id: true, email: true, nombre: true } },
} satisfies Prisma.OrderInclude;

const detailInclude = {
  items: true,
  shippingInfo: true,
  statusHistory: { orderBy: { createdAt: 'asc' } },
  user: { select: { id: true, email: true, nombre: true } },
} satisfies Prisma.OrderInclude;

const forStatusTransitionInclude = {
  items: true,
  shippingInfo: true,
  user: true,
} satisfies Prisma.OrderInclude;

const createInclude = {
  items: true,
  shippingInfo: true,
  statusHistory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

const forPaymentInclude = {
  items: true,
  shippingInfo: true,
} satisfies Prisma.OrderInclude;

@Injectable()
export class PrismaOrderRepository implements OrderRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(filter: OrderListFilter, skip: number, take: number) {
    const where: Prisma.OrderWhereInput = {};

    if (filter.userId) where.userId = filter.userId;
    if (filter.status) where.status = filter.status;
    if (filter.fechaDesde || filter.fechaHasta) {
      where.createdAt = {
        ...(filter.fechaDesde ? { gte: filter.fechaDesde } : {}),
        ...(filter.fechaHasta ? { lte: filter.fechaHasta } : {}),
      };
    }
    if (filter.search) {
      where.OR = [
        { orderNumber: { contains: filter.search, mode: 'insensitive' } },
        {
          shippingInfo: {
            email: { contains: filter.search, mode: 'insensitive' },
          },
        },
        {
          shippingInfo: {
            nombreCompleto: { contains: filter.search, mode: 'insensitive' },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: listInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data: data as OrderListItem[], total };
  }

  async findById(id: string): Promise<OrderDetail | null> {
    return this.prisma.order.findUnique({
      where: { id },
      include: detailInclude,
    });
  }

  async findByIdForStatusTransition(
    id: string,
  ): Promise<OrderForStatusTransition | null> {
    return this.prisma.order.findUnique({
      where: { id },
      include: forStatusTransitionInclude,
    });
  }

  async findByIdForPayment(id: string): Promise<OrderForPayment | null> {
    return this.prisma.order.findUnique({
      where: { id },
      include: forPaymentInclude,
    });
  }

  create(data: NewOrderData): Promise<CreatedOrder> {
    return this.prisma.order.create({
      data: {
        orderNumber: data.orderNumber,
        userId: data.userId,
        subtotal: data.subtotal,
        total: data.total,
        paymentMethod: data.paymentMethod,
        fbp: data.fbp,
        fbc: data.fbc,
        items: { create: data.items },
        shippingInfo: { create: data.shippingInfo },
        statusHistory: {
          create: {
            statusNuevo: EstadoPedido.PENDIENTE,
            changedBy: data.userId,
          },
        },
      },
      include: createInclude,
    });
  }

  async createConfirmed(data: NewConfirmedOrderData): Promise<CreatedOrder> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber: data.orderNumber,
          userId: data.userId,
          subtotal: data.subtotal,
          total: data.total,
          paymentMethod: data.paymentMethod,
          status: EstadoPedido.CONFIRMADO,
          fbp: data.fbp,
          fbc: data.fbc,
          items: { create: data.items },
          shippingInfo: { create: data.shippingInfo },
          statusHistory: {
            create: {
              statusAnterior: null,
              statusNuevo: EstadoPedido.CONFIRMADO,
              changedBy: 'MERCADOPAGO',
            },
          },
        },
        include: createInclude,
      });

      await this.aplicarConfirmacion(
        tx,
        created.id,
        created.items,
        data.shippingInfo.nombreCompleto,
        data.shippingInfo.telefono,
      );

      return created;
    });
  }

  async transitionStatus(params: {
    orderId: string;
    statusAnterior: EstadoPedido;
    statusNuevo: EstadoPedido;
    changedBy: string;
    aplicarConfirmacion: boolean;
    revertirConfirmacion: boolean;
  }): Promise<OrderForStatusTransition> {
    const {
      orderId,
      statusAnterior,
      statusNuevo,
      changedBy,
      aplicarConfirmacion,
      revertirConfirmacion,
    } = params;

    return this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: statusNuevo },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          statusAnterior,
          statusNuevo,
          changedBy,
        },
      });

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: forStatusTransitionInclude,
      });

      if (aplicarConfirmacion) {
        await this.aplicarConfirmacion(
          tx,
          order.id,
          order.items,
          order.shippingInfo?.nombreCompleto ?? order.user?.nombre ?? 'Cliente',
          order.shippingInfo?.telefono,
        );
      } else if (revertirConfirmacion) {
        await this.revertirConfirmacion(tx, order.id, order.items);
      }

      return order;
    });
  }

  async linkGuestOrders(email: string, userId: string): Promise<void> {
    await this.prisma.order.updateMany({
      where: { userId: null, shippingInfo: { email } },
      data: { userId },
    });
  }

  // Descuenta stock y crea una fila de venta por unidad (fuente "Plataforma"),
  // igual que el registro manual. Se asume pago completo: o ya aprobó
  // MercadoPago, o el admin confirma a mano tras cobrar contra entrega.
  private async aplicarConfirmacion(
    tx: Prisma.TransactionClient,
    orderId: string,
    items: {
      productId: string;
      nombre: string;
      cantidad: number;
      precioUnitario: number;
    }[],
    cliente: string,
    celular: string | null | undefined,
  ): Promise<void> {
    const productos = await tx.product.findMany({
      where: { id: { in: items.map((i) => i.productId) } },
    });
    const productMap = new Map(productos.map((p) => [p.id, p]));

    for (const item of items) {
      const product = productMap.get(item.productId);
      const { marca, modelo } = product
        ? deriveMarcaModeloFromProduct(product)
        : { marca: null, modelo: item.nombre };

      const inv = await findInventarioByModelo(tx, modelo, item.nombre);
      if (!inv) continue; // producto no rastreado en inventario maestro

      // Decremento atómico: la condición stock >= cantidad se evalúa y aplica
      // en el mismo UPDATE (Postgres bloquea la fila y re-evalúa el WHERE al
      // ejecutarse), así que dos confirmaciones concurrentes del mismo modelo
      // no pueden partir ambas del mismo stock "viejo" y sobre-vender la
      // última unidad.
      const { count } = await tx.inventarioMaestro.updateMany({
        where: { id: inv.id, stock: { gte: item.cantidad } },
        data: { stock: { decrement: item.cantidad } },
      });
      if (count === 0) {
        throw new BadRequestException(
          `Stock insuficiente para "${item.nombre}" (disponible: ${inv.stock}, solicitado: ${item.cantidad}).`,
        );
      }

      const invActualizado = await tx.inventarioMaestro.findUniqueOrThrow({
        where: { id: inv.id },
      });
      await tx.product.updateMany({
        where: { nombre: { equals: item.nombre, mode: 'insensitive' } },
        data: { disponible: invActualizado.stock > 0 },
      });

      const gananciaNeta = calcGananciaPorVenta(
        'Pagado',
        item.precioUnitario,
        inv.costoUnitario,
        0,
        item.precioUnitario,
      );
      await tx.historicalSale.createMany({
        data: Array.from({ length: item.cantidad }, () => ({
          orderId,
          fecha: new Date(),
          cliente,
          celular: celular ?? null,
          marca,
          modelo,
          precioVenta: item.precioUnitario,
          costoProducto: inv.costoUnitario,
          costoEnvio: 0,
          abono: item.precioUnitario,
          saldoPendiente: 0,
          gananciaNeta,
          fuente: 'Plataforma',
          estado: 'Pagado',
        })),
      });
    }
  }

  private async revertirConfirmacion(
    tx: Prisma.TransactionClient,
    orderId: string,
    items: { productId: string; nombre: string; cantidad: number }[],
  ): Promise<void> {
    await tx.historicalSale.deleteMany({ where: { orderId } });

    const productos = await tx.product.findMany({
      where: { id: { in: items.map((i) => i.productId) } },
    });
    const productMap = new Map(productos.map((p) => [p.id, p]));

    for (const item of items) {
      const product = productMap.get(item.productId);
      const modelo = product
        ? deriveMarcaModeloFromProduct(product).modelo
        : item.nombre;

      const inv = await findInventarioByModelo(tx, modelo, item.nombre);
      if (!inv) continue;

      const nuevoStock = inv.stock + item.cantidad;
      await tx.inventarioMaestro.update({
        where: { id: inv.id },
        data: { stock: nuevoStock },
      });
      await tx.product.updateMany({
        where: { nombre: { equals: item.nombre, mode: 'insensitive' } },
        data: { disponible: nuevoStock > 0 },
      });
    }
  }
}
