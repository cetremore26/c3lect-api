export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');
export const AUTH_SETTINGS = Symbol('AUTH_SETTINGS');

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
