export const PAYMENT_SETTINGS = Symbol('PAYMENT_SETTINGS');

// Configuración que los casos de uso necesitan, sin depender de ConfigService.
export interface PaymentSettingsPort {
  /** Lanza si el secreto no está configurado: un webhook sin verificar nunca se procesa. */
  webhookSecret(): string;
}
