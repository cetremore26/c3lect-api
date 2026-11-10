import type { PropositoOtp } from '../../domain/otp-policy';

export const IDENTITY_REPOSITORY = Symbol('IDENTITY_REPOSITORY');

export interface Credenciales {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  passwordHash: string | null;
}

export interface SecretoPendiente {
  id: string;
  hash: string;
}

export interface OtpVivo {
  id: string;
  hash: string;
  intentos: number;
}

// Tablas del contexto de identidad: users (credenciales), refresh_tokens,
// otp_codes y password_resets.
export interface IdentityRepositoryPort {
  findUserByEmail(email: string): Promise<Credenciales | null>;
  findUserById(id: string): Promise<Credenciales | null>;
  createUser(data: {
    email: string;
    passwordHash: string;
    nombre: string;
    telefono?: string;
  }): Promise<Credenciales>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;

  saveRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  /** Busca un refresh token vigente; devuelve su id y el usuario dueño. */
  findValidRefreshToken(
    tokenHash: string,
  ): Promise<{ id: string; user: Credenciales } | null>;
  deleteRefreshToken(id: string): Promise<void>;
  deleteRefreshTokensOf(userId: string): Promise<void>;

  countOtpsSince(
    email: string,
    proposito: PropositoOtp,
    desde: Date,
  ): Promise<number>;
  /** Marca como usados todos los OTP no usados del email y propósito. */
  invalidateOtps(email: string, proposito: PropositoOtp): Promise<void>;
  saveOtp(data: {
    email: string;
    proposito: PropositoOtp;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void>;
  /** OTP sin usar, vigente y el más reciente del email y propósito. */
  findLiveOtp(email: string, proposito: PropositoOtp): Promise<OtpVivo | null>;
  /**
   * Reserva atómica de un intento: true solo si el código seguía sin usar y
   * con menos de maxIntentos; al llegar a maxIntentos el código se quema.
   */
  reserveOtpAttempt(id: string, maxIntentos: number): Promise<boolean>;
  /** Consumo atómico: true solo para la llamada que lo marca como usado. */
  consumeOtp(id: string): Promise<boolean>;

  savePasswordReset(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  findValidPasswordResets(): Promise<(SecretoPendiente & { userId: string })[]>;
  markPasswordResetUsed(id: string): Promise<void>;
}
