import { Inject, Injectable, Logger } from '@nestjs/common';
import { EVENT_BUS } from '../../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../../shared/application/ports/event-bus.port';
import { UNIT_OF_WORK } from '../../../../shared/application/ports/unit-of-work.port';
import type { UnitOfWorkPort } from '../../../../shared/application/ports/unit-of-work.port';
import {
  BusinessRuleViolation,
  DomainError,
  UnauthorizedError,
} from '../../../../shared/domain/domain-error';
import { discrepanciaDeMonto } from '../../domain/discrepancia-de-monto';
import { mapEstadoPago } from '../../domain/mp-status';
import {
  PagoAprobado,
  PagoDuplicado,
  PagoReembolsado,
  PagoSinPedido,
} from '../../domain/payment-events';
import {
  ESTADOS_TERMINALES,
  EstadoPago,
  reglaDeTransicion,
} from '../../domain/payment-status';
import { verifyMpWebhookSignature } from '../../domain/verify-mp-webhook-signature';
import { ORDERS } from '../ports/orders.port';
import type { OrdersPort, PedidoParaPago } from '../ports/orders.port';
import { PAYMENT_GATEWAY } from '../ports/payment-gateway.port';
import type {
  MpPaymentStatus,
  PaymentGatewayPort,
} from '../ports/payment-gateway.port';
import { PAYMENT_REPOSITORY } from '../ports/payment-repository.port';
import type {
  Payment,
  PaymentRepositoryPort,
} from '../ports/payment-repository.port';
import { PAYMENT_SETTINGS } from '../ports/payment-settings.port';
import type { PaymentSettingsPort } from '../ports/payment-settings.port';

export interface WebhookNotification {
  type: string;
  data: { id: string };
}

/** Margen para crear el pedido (stock + ventas) dentro de la transacción. */
const TIMEOUT_APROBADO_MS = 15000;

/**
 * Procesa una notificación de MercadoPago. Nunca se traga un error: lo que no
 * es un fallo de negocio se propaga para que MercadoPago reintente. Todo
 * `approved` termina en un pedido o en una alerta al admin (PagoSinPedido o
 * PagoDuplicado); un rechazo nunca cancela pedidos.
 */
@Injectable()
export class HandleWebhookUseCase {
  private readonly logger = new Logger(HandleWebhookUseCase.name);

  constructor(
    @Inject(ORDERS) private readonly orders: OrdersPort,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGatewayPort,
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryPort,
    @Inject(PAYMENT_SETTINGS) private readonly settings: PaymentSettingsPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  async execute(
    notification: WebhookNotification,
    xSignature?: string,
    xRequestId?: string,
  ): Promise<void> {
    if (notification.type !== 'payment') return;
    const mpPaymentId = String(notification.data.id);

    this.verificarFirma(mpPaymentId, xSignature, xRequestId);

    const mp = await this.gateway.getPayment(mpPaymentId);
    const nuevoEstado = mapEstadoPago(mp.status);
    const aprobado = nuevoEstado === EstadoPago.APROBADO;

    const orderNumber = mp.externalReference;
    if (!orderNumber) {
      if (aprobado) {
        await this.reportarSinPedido(
          'SIN-REFERENCIA',
          mpPaymentId,
          'MercadoPago aprobó un pago sin external_reference',
        );
      }
      return;
    }

    const payment =
      await this.payments.findMostRecentByOrderNumber(orderNumber);
    if (!payment) {
      if (aprobado) {
        await this.reportarSinPedido(
          orderNumber,
          mpPaymentId,
          'No hay registro de pago para este número de pedido',
        );
      }
      return;
    }

    if (nuevoEstado === EstadoPago.REEMBOLSADO) {
      await this.uow.run(async () => {
        const aplicado = await this.transicionar(
          payment.id,
          EstadoPago.REEMBOLSADO,
          mpPaymentId,
        );
        if (!aplicado) {
          this.logger.warn(
            `Reembolso ${mpPaymentId} ignorado: el pago ${payment.id} no está APROBADO con ese mpPaymentId`,
          );
          return;
        }
        await this.events.publish(
          new PagoReembolsado({
            orderNumber,
            mpPaymentId,
            estadoMp: mp.status ?? '',
          }),
        );
      });
      return;
    }

    if (!aprobado) {
      // PENDIENTE, RECHAZADO o CANCELADO: solo se registra en el pago. Un
      // rechazo nunca cancela pedidos: el cliente puede reintentar y pagar.
      await this.transicionar(payment.id, nuevoEstado, mpPaymentId);
      return;
    }

    try {
      await this.uow.run(
        () => this.procesarAprobado(orderNumber, mpPaymentId, mp, payment),
        { timeout: TIMEOUT_APROBADO_MS },
      );
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      // Fallo de negocio: la primera transacción se revirtió. El dinero ya lo
      // cobró MercadoPago, así que el pago queda APROBADO y se alerta.
      await this.uow.run(async () => {
        const aplicado = await this.transicionar(
          payment.id,
          EstadoPago.APROBADO,
          mpPaymentId,
        );
        if (aplicado) {
          await this.reportarSinPedido(orderNumber, mpPaymentId, err.message);
        } else {
          await this.resolverYaProcesado(payment.id, orderNumber, mpPaymentId);
        }
      });
    }
  }

  private verificarFirma(
    mpPaymentId: string,
    xSignature: string | undefined,
    xRequestId: string | undefined,
  ): void {
    if (!xSignature || !xRequestId) {
      throw new UnauthorizedError('Firma del webhook inválida');
    }
    // Si falta MP_WEBHOOK_SECRET, webhookSecret() lanza y el error se propaga
    // tal cual (500): MercadoPago reintenta cuando se configure.
    const valida = verifyMpWebhookSignature(
      this.settings.webhookSecret(),
      mpPaymentId,
      xSignature,
      xRequestId,
      Date.now(),
    );
    if (!valida) throw new UnauthorizedError('Firma del webhook inválida');
  }

  private async procesarAprobado(
    orderNumber: string,
    mpPaymentId: string,
    mp: MpPaymentStatus,
    payment: Payment,
  ): Promise<void> {
    const aplicado = await this.transicionar(
      payment.id,
      EstadoPago.APROBADO,
      mpPaymentId,
    );
    if (!aplicado) {
      await this.resolverYaProcesado(payment.id, orderNumber, mpPaymentId);
      return;
    }

    const motivo = discrepanciaDeMonto(mp, payment.total);
    if (motivo) throw new BusinessRuleViolation(motivo);

    let pedido: PedidoParaPago;
    if (payment.orderId) {
      // Flujo viejo: el pedido ya existía como PENDIENTE.
      const existente = await this.orders.findForPayment(payment.orderId);
      if (!existente) throw new BusinessRuleViolation('El pedido ya no existe');
      if (!existente.pendiente) {
        throw new BusinessRuleViolation(
          'El pedido ya no está PENDIENTE: lo cambió otra operación',
        );
      }
      await this.orders.confirmarPorPago(existente.id);
      pedido = existente;
    } else {
      // Flujo nuevo: el pedido se crea ya CONFIRMADO desde el draftPayload.
      const draft = payment.draftPayload;
      if (!draft) {
        throw new BusinessRuleViolation(
          'El pago no tiene draftPayload: no se puede crear el pedido',
        );
      }
      pedido = await this.orders.crearConfirmadoPorPago({
        orderNumber,
        itemsData: draft.itemsData,
        subtotal: draft.subtotal,
        total: draft.total,
        shippingInfo: draft.shippingInfo,
        userId: draft.userId,
        fbp: draft.fbp,
        fbc: draft.fbc,
      });
      await this.payments.linkToOrder(payment.id, pedido.id);
    }

    await this.events.publish(
      new PagoAprobado({
        orderNumber: pedido.orderNumber,
        total: pedido.total,
        lineas: pedido.items,
        cliente: pedido.shippingInfo,
        fbp: pedido.fbp,
        fbc: pedido.fbc,
      }),
    );
  }

  private async reportarSinPedido(
    orderNumber: string,
    mpPaymentId: string,
    detalle: string,
  ): Promise<void> {
    this.logger.error(
      `Pago ${mpPaymentId} aprobado sin pedido (${orderNumber}): ${detalle}`,
    );
    await this.events.publish(
      new PagoSinPedido({ orderNumber, mpPaymentId, detalle }),
    );
  }

  /**
   * La transición a APROBADO no se aplicó: la fila ya está en otro estado.
   * Si es terminal con este mismo cobro, la primera entrega ya produjo el
   * pedido o la alerta. Si es terminal con otro cobro, el cliente pagó dos
   * veces. Cualquier otra cosa no debería pasar: se lanza para reintentar.
   */
  private async resolverYaProcesado(
    paymentId: string,
    orderNumber: string,
    mpPaymentId: string,
  ): Promise<void> {
    const fila = await this.payments.findById(paymentId);
    if (fila && ESTADOS_TERMINALES.includes(fila.estado)) {
      if (fila.mpPaymentId === mpPaymentId) return;
      this.logger.warn(
        `Pago duplicado para ${orderNumber}: ${mpPaymentId} (anterior ${fila.mpPaymentId})`,
      );
      await this.events.publish(
        new PagoDuplicado({
          orderNumber,
          mpPaymentId,
          mpPaymentIdAnterior: fila.mpPaymentId,
        }),
      );
      return;
    }
    throw new Error('Estado de pago inconsistente al procesar el webhook');
  }

  private transicionar(
    paymentId: string,
    nuevoEstado: EstadoPago,
    mpPaymentId: string,
  ): Promise<boolean> {
    return this.payments.transicionar({
      paymentId,
      nuevoEstado,
      mpPaymentId,
      regla: reglaDeTransicion(nuevoEstado),
    });
  }
}
