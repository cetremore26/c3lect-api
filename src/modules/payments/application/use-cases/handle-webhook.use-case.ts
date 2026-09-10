import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoPago, EstadoPedido, Payment } from '@prisma/client';
import { MailService } from '../../../../mail/mail.service';
import { MetaConversionsService } from '../../../meta-conversions/meta-conversions.service';
import { OrdersService } from '../../../orders/orders.service';
import { ORDER_REPOSITORY } from '../../../orders/application/ports/order-repository.port';
import type { OrderRepositoryPort } from '../../../orders/application/ports/order-repository.port';
import { mapEstadoPago } from '../../domain/mp-status';
import { verifyMpWebhookSignature } from '../../domain/verify-mp-webhook-signature';
import { WebhookPaymentDto } from '../../dto/webhook-payment.dto';
import { DraftPayload } from '../draft-payload';
import { PAYMENT_GATEWAY } from '../ports/payment-gateway.port';
import type { PaymentGatewayPort } from '../ports/payment-gateway.port';
import { PAYMENT_REPOSITORY } from '../ports/payment-repository.port';
import type { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { VOUCHER_GENERATOR } from '../ports/voucher-generator.port';
import type { VoucherGeneratorPort } from '../ports/voucher-generator.port';

@Injectable()
export class HandleWebhookUseCase {
  private readonly logger = new Logger(HandleWebhookUseCase.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly ordersService: OrdersService,
    private readonly metaConversions: MetaConversionsService,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepositoryPort,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryPort,
    @Inject(VOUCHER_GENERATOR) private readonly voucher: VoucherGeneratorPort,
  ) {}

  async execute(
    dto: WebhookPaymentDto,
    xSignature?: string,
    xRequestId?: string,
  ): Promise<void> {
    if (dto.type !== 'payment') return;

    if (!xSignature || !xRequestId) {
      this.logger.warn(
        `Webhook para payment ${dto.data.id} rechazado: faltan los headers de firma`,
      );
      return;
    }

    let signatureValid: boolean;
    try {
      const secret = this.config.getOrThrow<string>('MP_WEBHOOK_SECRET');
      signatureValid = verifyMpWebhookSignature(
        secret,
        dto.data.id,
        xSignature,
        xRequestId,
      );
    } catch (err) {
      // getOrThrow('MP_WEBHOOK_SECRET') falla aquí si el secreto no está configurado —
      // se registra fuerte y se rechaza el webhook en vez de procesarlo sin verificar.
      this.logger.error(
        'No se pudo verificar la firma del webhook (¿falta MP_WEBHOOK_SECRET?)',
        err,
      );
      return;
    }
    if (!signatureValid) {
      this.logger.warn(`Webhook signature invalid for payment ${dto.data.id}`);
      return;
    }

    try {
      const mpPayment = await this.gateway.getPayment(dto.data.id);
      const orderNumber = mpPayment.externalReference;
      const nuevoEstado = mapEstadoPago(mpPayment.status);

      if (!orderNumber) {
        this.logger.warn(
          `Webhook payment ${dto.data.id} has no external_reference`,
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
        mpPaymentId: String(dto.data.id),
      });
      if (!applied) return; // ya procesado por otra entrega del webhook

      if (nuevoEstado === EstadoPago.APROBADO) {
        await this.handleApproved(orderNumber, existingPayment);
      } else if (
        nuevoEstado === EstadoPago.RECHAZADO ||
        nuevoEstado === EstadoPago.CANCELADO
      ) {
        await this.handleRejected(orderNumber, existingPayment);
      }
    } catch (err) {
      this.logger.error('Error processing webhook', err);
    }
  }

  private async handleApproved(
    orderNumber: string,
    payment: Payment,
  ): Promise<void> {
    // Se amplió respecto del tipo original: el evento de Meta necesita
    // productId de cada item, el teléfono/ciudad/departamento del cliente y
    // las cookies fbp/fbc del pedido. Todos ya venían en las consultas — solo
    // faltaba declararlos aquí.
    let order: {
      id: string;
      orderNumber: string;
      total: number;
      fbp: string | null;
      fbc: string | null;
      shippingInfo: {
        email: string;
        nombreCompleto: string;
        telefono: string;
        ciudad: string;
        departamento: string;
      } | null;
      items: {
        productId: string;
        nombre: string;
        cantidad: number;
        precioUnitario: number;
        subtotal: number;
      }[];
    };

    if (payment.orderId) {
      // Compatibilidad con el flujo viejo (POST /payments/create sobre un
      // pedido que ya existía como PENDIENTE) — ya no lo usa el frontend,
      // pero se deja vivo por si se genera un link de pago para un pedido
      // existente en el futuro.
      const existing = await this.orderRepository.findByIdForPayment(
        payment.orderId,
      );
      if (!existing || existing.status !== EstadoPedido.PENDIENTE) return;

      try {
        // skipStatusEmail=true: ya enviamos un comprobante con PDF más abajo.
        await this.ordersService.updateStatus(
          existing.id,
          { status: EstadoPedido.CONFIRMADO },
          'MERCADOPAGO',
          true,
        );
      } catch (err) {
        this.logger.error(
          `Pago aprobado pero no se pudo confirmar el pedido ${orderNumber}`,
          err,
        );
        const adminEmail = this.config.get<string>('ADMIN_EMAIL');
        if (adminEmail) {
          const detalle = err instanceof Error ? err.message : String(err);
          void this.mail.sendStockAlert(adminEmail, orderNumber, detalle);
        }
        return;
      }
      order = existing;
    } else {
      // Flujo nuevo: el pedido no existía todavía. Se crea ya CONFIRMADO,
      // con el mismo descuento de stock + creación de ventas que cualquier
      // otra confirmación, a partir de los datos congelados en draftPayload.
      const draft = payment.draftPayload as unknown as DraftPayload | null;
      if (!draft) {
        this.logger.error(
          `Payment ${payment.id} aprobado sin draftPayload — no se puede crear el pedido`,
        );
        return;
      }

      try {
        const created = await this.ordersService.createConfirmedOrder({
          orderNumber,
          itemsData: draft.itemsData,
          subtotal: draft.subtotal,
          total: draft.total,
          shippingInfo: draft.shippingInfo,
          userId: draft.userId,
          fbp: draft.fbp,
          fbc: draft.fbc,
        });
        order = created;
      } catch (err) {
        // El dinero ya lo cobró MercadoPago — no podemos revertir eso. Si
        // falló por falta de stock, no queda ningún pedido creado y un admin
        // debe resolverlo manualmente (reabastecer y crear el pedido a mano,
        // o reembolsar).
        this.logger.error(
          `Pago aprobado pero no se pudo crear el pedido ${orderNumber}`,
          err,
        );
        const adminEmail = this.config.get<string>('ADMIN_EMAIL');
        if (adminEmail) {
          const detalle = err instanceof Error ? err.message : String(err);
          void this.mail.sendStockAlert(adminEmail, orderNumber, detalle);
        }
        return;
      }

      await this.payments.linkToOrder(payment.id, order.id);
    }

    const pdfBuffer = await this.voucher.generate(order);

    if (order.shippingInfo) {
      void this.mail.sendPaymentConfirmation(
        order.shippingInfo.email,
        order.shippingInfo.nombreCompleto,
        order.orderNumber,
        order.total,
        pdfBuffer,
      );
    }

    const adminEmail = this.config.get<string>('ADMIN_EMAIL');
    if (adminEmail) {
      void this.mail.sendPaymentConfirmation(
        adminEmail,
        'Admin',
        order.orderNumber,
        order.total,
        pdfBuffer,
      );
    }

    // Purchase por Conversions API. Esta es la fuente de verdad del evento:
    // se manda desde el servidor cuando el pago está confirmado de verdad, sin
    // depender de bloqueadores ni de que el navegador del cliente siga abierto.
    // El event_id es orderNumber — el mismo external_reference que se envió a
    // MercadoPago — para que Meta deduplique contra el evento del navegador.
    void this.metaConversions.sendPurchase({
      orderNumber: order.orderNumber,
      total: order.total,
      contentIds: order.items.map((i) => i.productId),
      user: {
        email: order.shippingInfo?.email,
        phone: order.shippingInfo?.telefono,
        firstName: order.shippingInfo?.nombreCompleto?.trim().split(' ')[0],
        lastName: order.shippingInfo?.nombreCompleto
          ?.trim()
          .split(' ')
          .slice(1)
          .join(' '),
        city: order.shippingInfo?.ciudad,
        state: order.shippingInfo?.departamento,
        fbp: order.fbp,
        fbc: order.fbc,
      },
    });
  }

  private async handleRejected(
    orderNumber: string,
    payment: Payment,
  ): Promise<void> {
    if (!payment.orderId) {
      // Flujo nuevo: nunca existió un pedido — no hay nada que cancelar.
      // El Payment ya quedó marcado RECHAZADO/CANCELADO antes de llegar aquí.
      return;
    }

    // Compatibilidad con el flujo viejo: el pedido ya existía como PENDIENTE.
    const order = await this.orderRepository.findByIdForPayment(
      payment.orderId,
    );
    if (!order || order.status !== EstadoPedido.PENDIENTE) return;

    await this.ordersService.updateStatus(
      order.id,
      { status: EstadoPedido.CANCELADO },
      'MERCADOPAGO',
    );
  }
}
