import { Inject, Injectable } from '@nestjs/common';
import { buildOrderNumber } from '../domain/order-number';
import { RequestedItem } from '../domain/order-pricing';
import { EstadoPedido } from '../domain/order-status';
import { ORDER_REPOSITORY } from './ports/order-repository.port';
import type { OrderRepositoryPort } from './ports/order-repository.port';
import {
  CreateConfirmedOrderParams,
  CreateConfirmedOrderUseCase,
} from './use-cases/create-confirmed-order.use-case';
import { ResolveOrderItemsUseCase } from './use-cases/resolve-order-items.use-case';
import { UpdateOrderStatusUseCase } from './use-cases/update-order-status.use-case';

const MERCADOPAGO = 'MERCADOPAGO';

// API pública del contexto de pedidos para otros módulos (se expone en
// public-api.ts). Habla en términos del negocio ("confirmar por pago"), no de
// la mecánica interna: payments no sabe que existe un UpdateOrderStatusUseCase
// ni un repositorio.
@Injectable()
export class OrdersFacade {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    private readonly resolveOrderItems: ResolveOrderItemsUseCase,
    private readonly createConfirmedOrder: CreateConfirmedOrderUseCase,
    private readonly updateOrderStatus: UpdateOrderStatusUseCase,
  ) {}

  /** Precios server-side + verificación de stock, sin crear nada. */
  cotizar(items: RequestedItem[], autenticado: boolean) {
    return this.resolveOrderItems.execute(items, autenticado);
  }

  nuevoNumeroDePedido(): string {
    return buildOrderNumber();
  }

  findForPayment(orderId: string) {
    return this.orders.findByIdForPayment(orderId);
  }

  /** Pedido PENDIENTE cuyo pago aprobó MercadoPago. */
  confirmarPorPago(orderId: string) {
    return this.updateOrderStatus.execute(
      orderId,
      EstadoPedido.CONFIRMADO,
      MERCADOPAGO,
      { notificar: false },
    );
  }

  /** Pedido PENDIENTE cuyo pago rechazó o canceló MercadoPago. */
  cancelarPorPago(orderId: string) {
    return this.updateOrderStatus.execute(
      orderId,
      EstadoPedido.CANCELADO,
      MERCADOPAGO,
    );
  }

  /** Materializa ya CONFIRMADO un pedido que solo existía como borrador del pago. */
  crearConfirmadoPorPago(params: CreateConfirmedOrderParams) {
    return this.createConfirmedOrder.execute(params);
  }

  totalsByUser(userIds: string[]) {
    return this.orders.totalsByUser(userIds);
  }

  listByUser(userId: string) {
    return this.orders.listByUser(userId);
  }
}
