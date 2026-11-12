import { randomInt } from 'crypto';

export const PropositoOtp = { LOGIN: 'LOGIN', ADMIN_2FA: 'ADMIN_2FA' } as const;
export type PropositoOtp = (typeof PropositoOtp)[keyof typeof PropositoOtp];

export const OTP_VIGENCIA_MS = 10 * 60 * 1000;
export const OTP_VENTANA_MS = 15 * 60 * 1000;
export const OTP_MAX_POR_VENTANA = 3;
export const OTP_MAX_INTENTOS = 5;

export function generarCodigoOtp(): string {
  return String(randomInt(100000, 1000000));
}
