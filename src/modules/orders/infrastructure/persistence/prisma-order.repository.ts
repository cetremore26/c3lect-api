import { Injectable } from '@nestjs/common';
import { EstadoPedido, Prisma } from '@prisma/client';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import {
  CreatedOrder,
  NewOrderData,
  OrderDetail,
  OrderForStatusTransition,
  OrderListFilter,
  OrderListItem,
  OrderRepositoryPort,
  OrderSnapshot,
  UserOrderSummary,
} from '../../application/ports/order-repository.port';

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
  user: { select: { nombre: true } },
} satisfies Prisma.OrderInclude;

const createInclude = {
  items: true,
  shippingInfo: true,
  statusHistory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

const snapshotInclude = {
  items: true,
  shippingInfo: true,
} satisfies Prisma.OrderInclude;

// Única pieza de orders que habla con Prisma. Toca solo las tablas del
// contexto (orders, order_items, shipping_info, order_status_history). Usa
// el cliente de la transacción ambiental, así participa de la unidad de
// trabajo del caso de uso sin recibirla por parámetro.
@Injectable()
export class PrismaOrderRepository implements OrderRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  async findMany(
    filter: OrderListFilter,
    skip: number,
    take: number,
  ): Promise<{ data: OrderListItem[]; total: number }> {
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
      this.db.client.order.findMany({
        where,
        include: listInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.db.client.order.count({ where }),
    ]);

    return { data, total };
  }

  findById(id: string): Promise<OrderDetail | null> {
    return this.db.client.order.findUnique({
      where: { id },
      include: detailInclude,
    });
  }

  findByIdForStatusTransition(
    id: string,
  ): Promise<OrderForStatusTransition | null> {
    return this.db.client.order.findUnique({
      where: { id },
      include: forStatusTransitionInclude,
    });
  }

  findByIdForPayment(id: string): Promise<OrderSnapshot | null> {
    return this.db.client.order.findUnique({
      where: { id },
      include: snapshotInclude,
    });
  }

  create(data: NewOrderData): Promise<CreatedOrder> {
    return this.db.client.order.create({
      data: {
        ...this.orderData(data),
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

  createConfirmed(
    data: NewOrderData,
    changedBy: string,
  ): Promise<CreatedOrder> {
    return this.db.client.order.create({
      data: {
        ...this.orderData(data),
        status: EstadoPedido.CONFIRMADO,
        statusHistory: {
          create: {
            statusAnterior: null,
            statusNuevo: EstadoPedido.CONFIRMADO,
            changedBy,
          },
        },
      },
      include: createInclude,
    });
  }

  async transitionStatus(params: {
    orderId: string;
    statusAnterior: EstadoPedido;
    statusNuevo: EstadoPedido;
    changedBy: string;
  }): Promise<OrderForStatusTransition> {
    const { orderId, statusAnterior, statusNuevo, changedBy } = params;
    const client = this.db.client;

    await client.order.update({
      where: { id: orderId },
      data: { status: statusNuevo },
    });
    await client.orderStatusHistory.create({
      data: { orderId, statusAnterior, statusNuevo, changedBy },
    });

    return client.order.findUniqueOrThrow({
      where: { id: orderId },
      include: forStatusTransitionInclude,
    });
  }

  async linkGuestOrders(email: string, userId: string): Promise<void> {
    await this.db.client.order.updateMany({
      where: { userId: null, shippingInfo: { email } },
      data: { userId },
    });
  }

  async totalsByUser(
    userIds: string[],
  ): Promise<{ userId: string; total: number }[]> {
    if (userIds.length === 0) return [];
    const rows = await this.db.client.order.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, total: true },
    });
    return rows.map((r) => ({ userId: r.userId!, total: r.total }));
  }

  listByUser(userId: string): Promise<UserOrderSummary[]> {
    return this.db.client.order.findMany({
      where: { userId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        createdAt: true,
        items: { select: { nombre: true, cantidad: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private orderData(data: NewOrderData) {
    return {
      orderNumber: data.orderNumber,
      userId: data.userId,
      subtotal: data.subtotal,
      total: data.total,
      paymentMethod: data.paymentMethod,
      fbp: data.fbp,
      fbc: data.fbc,
      items: { create: data.items },
      shippingInfo: { create: data.shippingInfo },
    };
  }
}
