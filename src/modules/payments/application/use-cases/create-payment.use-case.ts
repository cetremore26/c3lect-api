import { Inject, Injectable } from '@nestjs/common';
import {
  BusinessRuleViolation,
  NotFoundError,
} from '../../../../shared/domain/domain-error';
import { EstadoPago } from '../../domain/payment-status';
import { ORDERS } from '../ports/orders.port';
import type { OrdersPort } from '../ports/orders.port';
import { PAYMENT_GATEWAY } from '../ports/payment-gateway.port';
import type { PaymentGatewayPort } from '../ports/payment-gateway.port';
import { PAYMENT_REPOSITORY } from '../ports/payment-repository.port';
import type { PaymentRepositoryPort } from '../ports/payment-repository.port';

@Injectable()
export class CreatePaymentUseCase {
  constructor(
    @Inject(ORDERS) private readonly orders: OrdersPort,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryPort,
  ) {}

  async execute(cmd: { orderId: string }, userId?: string) {
    const order = await this.orders.findForPayment(cmd.orderId);
    if (!order) throw new NotFoundError('Pedido no encontrado.');
    if (!order.pendiente) {
      throw new BusinessRuleViolation(
        'El pedido ya no está pendiente y no puede procesarse.',
      );
    }

    const result = await this.gateway.createPreference({
      items: order.items.map((item) => ({
        id: item.productId,
        title: item.nombre,
        quantity: item.cantidad,
        unitPrice: item.precioUnitario,
      })),
      payerEmail: order.shippingInfo?.email ?? 'cliente@c3lect.com',
      externalReference: order.orderNumber,
    });

    const payment = await this.payments.create({
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: userId ?? null,
      estado: EstadoPago.PENDIENTE,
      preferenceId: result.preferenceId ?? null,
      checkoutUrl: result.checkoutUrl,
      total: order.total,
    });

    return {
      checkoutUrl: result.checkoutUrl,
      preferenceId: result.preferenceId,
      paymentId: payment.id,
    };
  }
}
