export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');
export const AUTH_SETTINGS = Symbol('AUTH_SETTINGS');
export const PURPOSE_TOKENS = Symbol('PURPOSE_TOKENS');

/** Hash lento para contraseñas, OTPs y tokens de restablecimiento (argon2). */
export interface PasswordHasherPort {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

export interface AccessTokenIssuerPort {
  issue(payload: { sub: string; email: string; rol: string }): string;
}

export interface AuthSettingsPort {
  frontendUrl(): string | undefined;
  /** Vigencia del refresh token, p. ej. "7d", "12h". */
  refreshTokenTtl(): string;
}

export type PropositoToken = 'registro' | 'admin-2fa';

export interface DatosDeProposito {
  sub?: string;
  email?: string;
}

/** Tokens firmados de corta vida y un solo propósito (no son access tokens). */
export interface PurposeTokenPort {
  firmar(
    proposito: PropositoToken,
    datos: DatosDeProposito,
    ttlSegundos: number,
  ): string;
  /** null si la firma, la expiración o el propósito no cuadran. */
  verificar(proposito: PropositoToken, token: string): DatosDeProposito | null;
}
