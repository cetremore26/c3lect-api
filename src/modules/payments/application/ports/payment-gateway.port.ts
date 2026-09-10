export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface PreferenceItem {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
}

export interface CreatePreferenceParams {
  items: PreferenceItem[];
  payerEmail: string;
  externalReference: string;
}

export interface PreferenceResult {
  /** Puede venir undefined: el SDK de MercadoPago no garantiza devolverlo. */
  preferenceId: string | undefined;
  checkoutUrl: string;
}

export interface MpPaymentStatus {
  status: string | undefined;
  externalReference: string | null | undefined;
}

// Abstrae el SDK de MercadoPago. La única implementación real vive en
// infrastructure/mercadopago-payment.gateway.ts — aquí no hay nada de
// currency, back_urls ni statement_descriptor: eso es detalle de cómo se le
// habla a MercadoPago, no algo que los casos de uso necesiten decidir.
export interface PaymentGatewayPort {
  createPreference(params: CreatePreferenceParams): Promise<PreferenceResult>;
  getPayment(mpPaymentId: string): Promise<MpPaymentStatus>;
}
