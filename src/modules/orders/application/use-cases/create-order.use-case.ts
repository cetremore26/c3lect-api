import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '../../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../../shared/application/ports/event-bus.port';
import { TooManyRequestsError } from '../../../../shared/domain/domain-error';
import { MAX_PEDIDOS_POR_EMAIL_POR_HORA } from '../../domain/order-limits';
import { PedidoCreado } from '../../domain/order-events';
import { buildOrderNumber } from '../../domain/order-number';
import { CreateOrderCommand } from '../commands';
import { ORDER_REPOSITORY } from '../ports/order-repository.port';
import type { OrderRepositoryPort } from '../ports/order-repository.port';
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
  async execute(cmd: CreateOrderCommand, userId?: string) {
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

    const order = await this.orders.create({
      orderNumber: buildOrderNumber(),
      userId: userId ?? null,
      subtotal,
      total,
      paymentMethod: cmd.metodoPago,
      fbp: cmd.fbp ?? null,
      fbc: cmd.fbc ?? null,
      items: itemsData,
      shippingInfo: cmd.shippingInfo,
    });

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
}
