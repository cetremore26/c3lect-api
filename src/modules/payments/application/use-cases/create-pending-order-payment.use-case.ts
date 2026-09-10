import { Injectable, Inject } from '@nestjs/common';
import { EstadoPago } from '@prisma/client';
import {
  buildOrderNumber,
  OrdersService,
} from '../../../orders/orders.service';
import { CreatePendingPaymentDto } from '../../dto/create-pending-payment.dto';
import { DraftPayload } from '../draft-payload';
import { PAYMENT_GATEWAY } from '../ports/payment-gateway.port';
import type { PaymentGatewayPort } from '../ports/payment-gateway.port';
import { PAYMENT_REPOSITORY } from '../ports/payment-repository.port';
import type { PaymentRepositoryPort } from '../ports/payment-repository.port';

@Injectable()
export class CreatePendingOrderPaymentUseCase {
  constructor(
    private readonly ordersService: OrdersService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryPort,
  ) {}

  // Crea la preferencia de pago SIN crear el pedido todavía. El pedido solo
  // se materializa cuando el webhook confirma el pago aprobado (ver
  // HandleWebhookUseCase). Así un pago abandonado/rechazado/fallido en
  // MercadoPago nunca deja un pedido huérfano en PENDIENTE.
  async execute(dto: CreatePendingPaymentDto, userId?: string) {
    const { itemsData, subtotal, total } =
      await this.ordersService.resolveItems(dto.items, !!userId);
    const orderNumber = buildOrderNumber();

    const result = await this.gateway.createPreference({
      items: itemsData.map((item) => ({
        id: item.productId,
        title: item.nombre,
        quantity: item.cantidad,
        unitPrice: item.precioUnitario,
      })),
      payerEmail: dto.shippingInfo.email,
      externalReference: orderNumber,
    });

    const draftPayload: DraftPayload = {
      itemsData,
      subtotal,
      total,
      shippingInfo: dto.shippingInfo,
      userId: userId ?? null,
      fbp: dto.fbp ?? null,
      fbc: dto.fbc ?? null,
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
