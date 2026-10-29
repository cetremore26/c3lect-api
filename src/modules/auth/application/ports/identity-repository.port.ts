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

  saveOtp(email: string, codeHash: string, expiresAt: Date): Promise<void>;
  /** OTPs vigentes y sin usar del email, del más reciente al más antiguo. */
  findValidOtps(email: string): Promise<SecretoPendiente[]>;
  markOtpUsed(id: string): Promise<void>;

  savePasswordReset(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  findValidPasswordResets(): Promise<(SecretoPendiente & { userId: string })[]>;
  markPasswordResetUsed(id: string): Promise<void>;
}
