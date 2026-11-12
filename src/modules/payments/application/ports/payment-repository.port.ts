import type {
  EstadoPago,
  ReglaDeTransicion,
} from '../../domain/payment-status';
import type { DraftPayload } from '../draft-payload';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export interface Payment {
  id: string;
  orderId: string | null;
  orderNumber: string;
  userId: string | null;
  estado: EstadoPago;
  preferenceId: string | null;
  checkoutUrl: string | null;
  mpPaymentId: string | null;
  total: number;
  draftPayload: DraftPayload | null;
  createdAt: Date;
  updatedAt: Date;
}

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

  findById(id: string): Promise<Payment | null>;

  /**
   * Transicion atomica y condicional: solo aplica si el pago esta en alguno
   * de los estados de origen de la regla (y, si la regla lo exige, con el
   * mismo mpPaymentId). MercadoPago reintenta la entrega del webhook, asi
   * que esta es la guarda que evita procesar dos veces la misma
   * notificacion. Devuelve true si actualizo exactamente una fila.
   */
  transicionar(params: {
    paymentId: string;
    nuevoEstado: EstadoPago;
    mpPaymentId: string;
    regla: ReglaDeTransicion;
  }): Promise<boolean>;

  linkToOrder(paymentId: string, orderId: string): Promise<void>;
}
