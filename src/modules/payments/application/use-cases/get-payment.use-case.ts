import { Inject, Injectable } from '@nestjs/common';
import {
  ForbiddenError,
  NotFoundError,
} from '../../../../shared/domain/domain-error';
import type { EstadoPago } from '../../domain/payment-status';
import { ORDERS } from '../ports/orders.port';
import type { OrdersPort } from '../ports/orders.port';
import { PAYMENT_REPOSITORY } from '../ports/payment-repository.port';
import type { PaymentRepositoryPort } from '../ports/payment-repository.port';

export interface Solicitante {
  userId?: string;
  rol?: string;
}

/** Lo único del pago que se expone: sin draftPayload (PII), userId ni ids de MP. */
export interface PagoVisible {
  id: string;
  orderId: string | null;
  orderNumber: string;
  estado: EstadoPago;
  total: number;
  checkoutUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Dueño del pedido o ADMIN. Un pedido de invitado (sin userId) solo es de ADMIN. */
export function puedeVerPedido(
  order: { userId: string | null },
  quien: Solicitante,
): boolean {
  return (
    quien.rol === 'ADMIN' ||
    (order.userId !== null && order.userId === quien.userId)
  );
}

@Injectable()
export class GetPaymentUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryPort,
    @Inject(ORDERS) private readonly orders: OrdersPort,
  ) {}

  async execute(orderId: string, quien: Solicitante): Promise<PagoVisible> {
    const order = await this.orders.findForPayment(orderId);
    if (!order) throw new NotFoundError('Pedido no encontrado.');
    if (!puedeVerPedido(order, quien)) {
      throw new ForbiddenError('No tienes permiso sobre este pedido.');
    }

    const payment = await this.payments.findMostRecentByOrderId(orderId);
    if (!payment)
      throw new NotFoundError('No hay registro de pago para este pedido.');

    return {
      id: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.orderNumber,
      estado: payment.estado,
      total: payment.total,
      checkoutUrl: payment.checkoutUrl,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
