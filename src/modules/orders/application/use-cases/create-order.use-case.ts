import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '../../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../../shared/application/ports/event-bus.port';
import {
  ConflictError,
  TooManyRequestsError,
} from '../../../../shared/domain/domain-error';
import { MAX_PEDIDOS_POR_EMAIL_POR_HORA } from '../../domain/order-limits';
import { PedidoCreado } from '../../domain/order-events';
import { buildOrderNumber } from '../../domain/order-number';
import { CreateOrderCommand } from '../commands';
import { ORDER_REPOSITORY } from '../ports/order-repository.port';
import type {
  CreatedOrder,
  OrderRepositoryPort,
} from '../ports/order-repository.port';
import { ResolveOrderItemsUseCase } from './resolve-order-items.use-case';

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    private readonly resolveOrderItems: ResolveOrderItemsUseCase,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  // Checkout directo (contraentrega / transferencia): el pedido nace
  // PENDIENTE. Los correos al cliente y al admin, y el Purchase de Meta, los
  // disparan los módulos que escuchan PedidoCreado — este caso de uso no
  // sabe que existen.
  async execute(
    cmd: CreateOrderCommand,
    userId?: string,
  ): Promise<CreatedOrder> {
    // Antes del límite por email: un reintento no es un pedido más.
    if (cmd.idempotencyKey) {
      const previo = await this.orders.findByIdempotencyKey(cmd.idempotencyKey);
      if (previo) return this.repetido(previo, cmd);
    }

    const desde = new Date(Date.now() - 60 * 60 * 1000);
    const recientes = await this.orders.countByShippingEmailSince(
      cmd.shippingInfo.email,
      desde,
    );
    if (recientes >= MAX_PEDIDOS_POR_EMAIL_POR_HORA) {
      throw new TooManyRequestsError(
        'Demasiados pedidos con este correo. Intenta de nuevo en una hora.',
      );
    }

    const { itemsData, subtotal, total } = await this.resolveOrderItems.execute(
      cmd.items,
      !!userId,
    );

    const { order, nuevo } = await this.orders.create({
      orderNumber: buildOrderNumber(),
      userId: userId ?? null,
      subtotal,
      total,
      paymentMethod: cmd.metodoPago,
      fbp: cmd.fbp ?? null,
      fbc: cmd.fbc ?? null,
      items: itemsData,
      shippingInfo: cmd.shippingInfo,
      idempotencyKey: cmd.idempotencyKey ?? null,
    });
    // Otra petición con la misma clave ganó la carrera: ella ya publicó.
    if (!nuevo) return this.repetido(order, cmd);

    await this.events.publish(
      new PedidoCreado({
        orderId: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        metodoPago: order.paymentMethod,
        lineas: order.items.map((i) => ({
          productId: i.productId,
          nombre: i.nombre,
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario,
          subtotal: i.subtotal,
        })),
        cliente: {
          email: cmd.shippingInfo.email,
          nombreCompleto: cmd.shippingInfo.nombreCompleto,
          telefono: cmd.shippingInfo.telefono,
          ciudad: cmd.shippingInfo.ciudad,
          departamento: cmd.shippingInfo.departamento,
        },
        fbp: order.fbp,
        fbc: order.fbc,
      }),
    );

    return order;
  }

  // La clave sola no autoriza a ver un pedido ajeno: tiene que venir con el
  // mismo email de envío.
  private repetido(order: CreatedOrder, cmd: CreateOrderCommand): CreatedOrder {
    const normalizar = (email: string | undefined) =>
      (email ?? '').trim().toLowerCase();
    if (
      normalizar(order.shippingInfo?.email) !==
      normalizar(cmd.shippingInfo.email)
    ) {
      throw new ConflictError(
        'Esta clave de idempotencia ya se usó para otro pedido.',
      );
    }
    return order;
  }
}
