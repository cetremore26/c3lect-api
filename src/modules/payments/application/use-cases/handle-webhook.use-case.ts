import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_BUS } from '../../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../../shared/application/ports/event-bus.port';
import { mapEstadoPago } from '../../domain/mp-status';
import { PagoAprobado, PagoSinPedido } from '../../domain/payment-events';
import { EstadoPago } from '../../domain/payment-status';
import { verifyMpWebhookSignature } from '../../domain/verify-mp-webhook-signature';
import { ORDERS } from '../ports/orders.port';
import type { OrdersPort, PedidoParaPago } from '../ports/orders.port';
import { PAYMENT_GATEWAY } from '../ports/payment-gateway.port';
import type { PaymentGatewayPort } from '../ports/payment-gateway.port';
import { PAYMENT_REPOSITORY } from '../ports/payment-repository.port';
import type {
  Payment,
  PaymentRepositoryPort,
} from '../ports/payment-repository.port';
import { PAYMENT_SETTINGS } from '../ports/payment-settings.port';
import type { PaymentSettingsPort } from '../ports/payment-settings.port';
import { VOUCHER_GENERATOR } from '../ports/voucher-generator.port';
import type { VoucherGeneratorPort } from '../ports/voucher-generator.port';

export interface WebhookNotification {
  type: string;
  data: { id: string };
}

@Injectable()
export class HandleWebhookUseCase {
  private readonly logger = new Logger(HandleWebhookUseCase.name);

  constructor(
    @Inject(ORDERS) private readonly orders: OrdersPort,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryPort,
    @Inject(VOUCHER_GENERATOR) private readonly voucher: VoucherGeneratorPort,
    @Inject(PAYMENT_SETTINGS) private readonly settings: PaymentSettingsPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  async execute(
    notification: WebhookNotification,
    xSignature?: string,
    xRequestId?: string,
  ): Promise<void> {
    if (notification.type !== 'payment') return;
    const mpPaymentId = notification.data.id;

    if (!xSignature || !xRequestId) {
      this.logger.warn(
        `Webhook para payment ${mpPaymentId} rechazado: faltan los headers de firma`,
      );
      return;
    }

    let signatureValid: boolean;
    try {
      signatureValid = verifyMpWebhookSignature(
        this.settings.webhookSecret(),
        mpPaymentId,
        xSignature,
        xRequestId,
      );
    } catch (err) {
      // webhookSecret() falla si el secreto no está configurado — se registra
      // fuerte y se rechaza el webhook en vez de procesarlo sin verificar.
      this.logger.error(
        'No se pudo verificar la firma del webhook (¿falta MP_WEBHOOK_SECRET?)',
        err,
      );
      return;
    }
    if (!signatureValid) {
      this.logger.warn(`Webhook signature invalid for payment ${mpPaymentId}`);
      return;
    }

    try {
      const mpPayment = await this.gateway.getPayment(mpPaymentId);
      const orderNumber = mpPayment.externalReference;
      const nuevoEstado = mapEstadoPago(mpPayment.status);

      if (!orderNumber) {
        this.logger.warn(
          `Webhook payment ${mpPaymentId} has no external_reference`,
        );
        return;
      }

      const existingPayment =
        await this.payments.findMostRecentByOrderNumber(orderNumber);
      if (!existingPayment) {
        this.logger.warn(`No payment record found for order ${orderNumber}`);
        return;
      }

      const applied = await this.payments.markProcessedIfNotTerminal({
        paymentId: existingPayment.id,
        nuevoEstado,
        mpPaymentId: String(mpPaymentId),
      });
      if (!applied) return; // ya procesado por otra entrega del webhook

      if (nuevoEstado === EstadoPago.APROBADO) {
        await this.handleApproved(orderNumber, existingPayment);
      } else if (
        nuevoEstado === EstadoPago.RECHAZADO ||
        nuevoEstado === EstadoPago.CANCELADO
      ) {
        await this.handleRejected(existingPayment);
      }
    } catch (err) {
      this.logger.error('Error processing webhook', err);
    }
  }

  private async handleApproved(
    orderNumber: string,
    payment: Payment,
  ): Promise<void> {
    const order = payment.orderId
      ? await this.confirmarPedidoExistente(orderNumber, payment.orderId)
      : await this.materializarPedido(orderNumber, payment);
    if (!order) return;

    await this.events.publish(
      new PagoAprobado({
        orderNumber: order.orderNumber,
        total: order.total,
        lineas: order.items,
        cliente: order.shippingInfo,
        fbp: order.fbp,
        fbc: order.fbc,
        comprobantePdf: await this.voucher.generate(order),
      }),
    );
  }

  // Compatibilidad con el flujo viejo (POST /payments/create sobre un pedido
  // que ya existía como PENDIENTE) — ya no lo usa el frontend, pero se deja
  // vivo por si se genera un link de pago para un pedido existente.
  private async confirmarPedidoExistente(
    orderNumber: string,
    orderId: string,
  ): Promise<PedidoParaPago | null> {
    const existing = await this.orders.findForPayment(orderId);
    if (!existing || !existing.pendiente) return null;

    try {
      await this.orders.confirmarPorPago(existing.id);
    } catch (err) {
      await this.reportarPagoSinPedido(
        orderNumber,
        `Pago aprobado pero no se pudo confirmar el pedido ${orderNumber}`,
        err,
      );
      return null;
    }
    return existing;
  }

  // Flujo nuevo: el pedido no existía todavía. Se crea ya CONFIRMADO, con el
  // mismo descuento de stock + creación de ventas que cualquier otra
  // confirmación, a partir de los datos congelados en draftPayload.
  private async materializarPedido(
    orderNumber: string,
    payment: Payment,
  ): Promise<PedidoParaPago | null> {
    const draft = payment.draftPayload;
    if (!draft) {
      this.logger.error(
        `Payment ${payment.id} aprobado sin draftPayload — no se puede crear el pedido`,
      );
      return null;
    }

    let created: PedidoParaPago;
    try {
      created = await this.orders.crearConfirmadoPorPago({
        orderNumber,
        itemsData: draft.itemsData,
        subtotal: draft.subtotal,
        total: draft.total,
        shippingInfo: draft.shippingInfo,
        userId: draft.userId,
        fbp: draft.fbp,
        fbc: draft.fbc,
      });
    } catch (err) {
      // El dinero ya lo cobró MercadoPago — no podemos revertir eso. Si falló
      // por falta de stock, no queda ningún pedido creado.
      await this.reportarPagoSinPedido(
        orderNumber,
        `Pago aprobado pero no se pudo crear el pedido ${orderNumber}`,
        err,
      );
      return null;
    }

    await this.payments.linkToOrder(payment.id, created.id);
    return created;
  }

  private async handleRejected(payment: Payment): Promise<void> {
    // Flujo nuevo: nunca existió un pedido — no hay nada que cancelar. El
    // Payment ya quedó marcado RECHAZADO/CANCELADO antes de llegar aquí.
    if (!payment.orderId) return;

    // Compatibilidad con el flujo viejo: el pedido ya existía como PENDIENTE.
    const order = await this.orders.findForPayment(payment.orderId);
    if (!order || !order.pendiente) return;

    await this.orders.cancelarPorPago(order.id);
  }

  private async reportarPagoSinPedido(
    orderNumber: string,
    mensaje: string,
    err: unknown,
  ): Promise<void> {
    this.logger.error(mensaje, err);
    await this.events.publish(
      new PagoSinPedido({
        orderNumber,
        detalle: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
