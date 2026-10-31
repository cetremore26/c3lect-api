import { Inject, Injectable } from '@nestjs/common';
import { EstadoPago } from '../../domain/payment-status';
import { DraftPayload } from '../draft-payload';
import { ORDERS } from '../ports/orders.port';
import type { OrdersPort, ShippingSnapshot } from '../ports/orders.port';
import { PAYMENT_GATEWAY } from '../ports/payment-gateway.port';
import type { PaymentGatewayPort } from '../ports/payment-gateway.port';
import { PAYMENT_REPOSITORY } from '../ports/payment-repository.port';
import type { PaymentRepositoryPort } from '../ports/payment-repository.port';

export interface CreatePendingPaymentCommand {
  items: { productId: string; cantidad: number }[];
  shippingInfo: ShippingSnapshot;
  fbp?: string;
  fbc?: string;
}

@Injectable()
export class CreatePendingOrderPaymentUseCase {
  constructor(
    @Inject(ORDERS) private readonly orders: OrdersPort,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryPort,
  ) {}

  // Crea la preferencia de pago SIN crear el pedido todavía. El pedido solo
  // se materializa cuando el webhook confirma el pago aprobado (ver
  // HandleWebhookUseCase). Así un pago abandonado/rechazado/fallido en
  // MercadoPago nunca deja un pedido huérfano en PENDIENTE.
  async execute(cmd: CreatePendingPaymentCommand, userId?: string) {
    const { itemsData, subtotal, total } = await this.orders.cotizar(
      cmd.items,
      !!userId,
    );
    const orderNumber = this.orders.nuevoNumeroDePedido();

    const result = await this.gateway.createPreference({
      items: itemsData.map((item) => ({
        id: item.productId,
        title: item.nombre,
        quantity: item.cantidad,
        unitPrice: item.precioUnitario,
      })),
      payerEmail: cmd.shippingInfo.email,
      externalReference: orderNumber,
    });

    const draftPayload: DraftPayload = {
      itemsData,
      subtotal,
      total,
      shippingInfo: cmd.shippingInfo,
      userId: userId ?? null,
      fbp: cmd.fbp ?? null,
      fbc: cmd.fbc ?? null,
    };

    const payment = await this.payments.create({
      orderId: null,
      orderNumber,
      userId: userId ?? null,
      estado: EstadoPago.PENDIENTE,
      preferenceId: result.preferenceId ?? null,
      checkoutUrl: result.checkoutUrl,
      total,
      draftPayload,
    });

    return {
      checkoutUrl: result.checkoutUrl,
      preferenceId: result.preferenceId,
      paymentId: payment.id,
    };
  }
}
