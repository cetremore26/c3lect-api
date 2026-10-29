import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { EVENT_BUS } from '../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../shared/application/ports/event-bus.port';
import { UNIT_OF_WORK } from '../../../shared/application/ports/unit-of-work.port';
import type { UnitOfWorkPort } from '../../../shared/application/ports/unit-of-work.port';
import {
  ConflictError,
  UnauthorizedError,
} from '../../../shared/domain/domain-error';
import { parseExpiry } from '../domain/expiry';
import {
  CodigoDeAccesoSolicitado,
  RestablecimientoDeClaveSolicitado,
  UsuarioRegistrado,
} from '../domain/identity-events';
import {
  ACCESS_TOKEN_ISSUER,
  AUTH_SETTINGS,
  PASSWORD_HASHER,
} from './ports/auth-services.port';
import type {
  AccessTokenIssuerPort,
  AuthSettingsPort,
  PasswordHasherPort,
} from './ports/auth-services.port';
import { IDENTITY_REPOSITORY } from './ports/identity-repository.port';
import type {
  Credenciales,
  IdentityRepositoryPort,
} from './ports/identity-repository.port';

export interface RegisterCommand {
  email: string;
  password: string;
  nombre: string;
  telefono?: string;
}

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    @Inject(IDENTITY_REPOSITORY)
    private readonly identity: IdentityRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(ACCESS_TOKEN_ISSUER)
    private readonly tokens: AccessTokenIssuerPort,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettingsPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  // El correo de bienvenida lo manda notificaciones y la vinculación de
  // pedidos hechos como invitado la hace orders, ambos reaccionando a
  // UsuarioRegistrado. La vinculación corre en esta misma transacción.
  async register(cmd: RegisterCommand) {
    const existing = await this.identity.findUserByEmail(cmd.email);
    if (existing) throw new ConflictError('El correo ya está registrado.');

    const passwordHash = await this.hasher.hash(cmd.password);

    return this.uow.run(async () => {
      const user = await this.identity.createUser({
        email: cmd.email,
        passwordHash,
        nombre: cmd.nombre,
        telefono: cmd.telefono,
      });
      const tokens = await this.generateTokens(user);

      await this.events.publish(
        new UsuarioRegistrado({
          userId: user.id,
          email: user.email,
          nombre: user.nombre,
        }),
      );

      return { ...tokens, user: this.publicUser(user) };
    });
  }

  async login(cmd: { email: string; password: string }) {
    const GENERIC = 'Credenciales incorrectas.';

    const user = await this.identity.findUserByEmail(cmd.email);
    if (!user || !user.passwordHash) throw new UnauthorizedError(GENERIC);

    const valid = await this.hasher.verify(user.passwordHash, cmd.password);
    if (!valid) throw new UnauthorizedError(GENERIC);

    const tokens = await this.generateTokens(user);
    return { ...tokens, user: this.publicUser(user) };
  }

  async requestOtp(cmd: { email: string }) {
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await this.hasher.hash(codigo);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.identity.saveOtp(cmd.email, codeHash, expiresAt);
    await this.events.publish(
      new CodigoDeAccesoSolicitado({ email: cmd.email, codigo }),
    );

    return { message: 'Si el correo está registrado, recibirás un código.' };
  }

  async verifyOtp(cmd: { email: string; code: string }) {
    const records = await this.identity.findValidOtps(cmd.email);

    let matchedId: string | null = null;
    for (const record of records) {
      if (await this.hasher.verify(record.hash, cmd.code)) {
        matchedId = record.id;
        break;
      }
    }
    if (!matchedId) throw new UnauthorizedError('Código inválido o expirado.');

    await this.identity.markOtpUsed(matchedId);

    const user = await this.identity.findUserByEmail(cmd.email);
    if (!user) return { requiresRegistration: true };

    const tokens = await this.generateTokens(user);
    return { ...tokens, user: this.publicUser(user) };
  }

  async requestPasswordReset(cmd: { email: string }) {
    const user = await this.identity.findUserByEmail(cmd.email);

    if (user) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = await this.hasher.hash(rawToken);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await this.identity.savePasswordReset(user.id, tokenHash, expiresAt);
      await this.events.publish(
        new RestablecimientoDeClaveSolicitado({
          email: user.email,
          resetUrl: `${this.settings.frontendUrl()}/reset-password?token=${rawToken}`,
        }),
      );
    }

    return { message: 'Si el correo está registrado, recibirás un enlace.' };
  }

  async resetPassword(cmd: { token: string; newPassword: string }) {
    const records = await this.identity.findValidPasswordResets();

    let matched: (typeof records)[number] | null = null;
    for (const record of records) {
      if (await this.hasher.verify(record.hash, cmd.token)) {
        matched = record;
        break;
      }
    }
    if (!matched) throw new UnauthorizedError('Token inválido o expirado.');
    const { id, userId } = matched;

    const passwordHash = await this.hasher.hash(cmd.newPassword);

    await this.uow.run(async () => {
      await this.identity.updatePassword(userId, passwordHash);
      await this.identity.markPasswordResetUsed(id);
      await this.identity.deleteRefreshTokensOf(userId);
    });

    return { message: 'Contraseña actualizada correctamente.' };
  }

  async refreshTokens(cmd: { refreshToken: string }) {
    const record = await this.identity.findValidRefreshToken(
      sha256(cmd.refreshToken),
    );
    if (!record)
      throw new UnauthorizedError('Refresh token inválido o expirado.');

    await this.identity.deleteRefreshToken(record.id);

    return this.generateTokens(record.user);
  }

  async getMe(userId: string) {
    const user = await this.identity.findUserById(userId);
    if (!user) throw new UnauthorizedError('Usuario no encontrado.');
    return this.publicUser(user);
  }

  async logout(userId: string) {
    await this.identity.deleteRefreshTokensOf(userId);
    return { message: 'Sesión cerrada.' };
  }

  private async generateTokens(user: Credenciales) {
    const accessToken = this.tokens.issue({
      sub: user.id,
      email: user.email,
      rol: user.rol,
    });

    const rawToken = randomBytes(32).toString('hex');
    await this.identity.saveRefreshToken(
      user.id,
      sha256(rawToken),
      parseExpiry(this.settings.refreshTokenTtl()),
    );

    return { accessToken, refreshToken: rawToken };
  }

  private publicUser(user: Credenciales) {
    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
    };
  }
}
