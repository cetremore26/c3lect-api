import { EstadoPago, Payment } from '@prisma/client';
import { DraftPayload } from '../draft-payload';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export interface NewPaymentData {
  orderId: string | null;
  orderNumber: string;
  userId: string | null;
  estado: EstadoPago;
  preferenceId: string | null;
  checkoutUrl: string;
  total: number;
  draftPayload?: DraftPayload | null;
}

export interface PaymentRepositoryPort {
  create(data: NewPaymentData): Promise<Payment>;

  findMostRecentByOrderId(orderId: string): Promise<Payment | null>;

  findMostRecentByOrderNumber(orderNumber: string): Promise<Payment | null>;

  /**
   * Actualización atómica: solo aplica si el pago no está ya en un estado
   * terminal (APROBADO/RECHAZADO/CANCELADO). MercadoPago reintenta la
   * entrega del webhook, así que esta es la guarda que evita procesar dos
   * veces la misma notificación. Devuelve si se aplicó.
   */
  markProcessedIfNotTerminal(params: {
    paymentId: string;
    nuevoEstado: EstadoPago;
    mpPaymentId: string;
  }): Promise<boolean>;

  linkToOrder(paymentId: string, orderId: string): Promise<void>;
}
