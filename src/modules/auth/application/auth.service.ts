import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { EVENT_BUS } from '../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../shared/application/ports/event-bus.port';
import { UNIT_OF_WORK } from '../../../shared/application/ports/unit-of-work.port';
import type { UnitOfWorkPort } from '../../../shared/application/ports/unit-of-work.port';
import {
  BusinessRuleViolation,
  ConflictError,
  UnauthorizedError,
} from '../../../shared/domain/domain-error';
import { parseExpiry } from '../domain/expiry';
import {
  generarCodigoOtp,
  OTP_MAX_INTENTOS,
  OTP_MAX_POR_VENTANA,
  OTP_VENTANA_MS,
  OTP_VIGENCIA_MS,
  PropositoOtp,
} from '../domain/otp-policy';
import {
  CodigoDeAccesoSolicitado,
  RestablecimientoDeClaveSolicitado,
  UsuarioRegistrado,
} from '../domain/identity-events';
import {
  ACCESS_TOKEN_ISSUER,
  AUTH_SETTINGS,
  PASSWORD_HASHER,
  PURPOSE_TOKENS,
} from './ports/auth-services.port';
import type {
  AccessTokenIssuerPort,
  AuthSettingsPort,
  PasswordHasherPort,
  PurposeTokenPort,
} from './ports/auth-services.port';
import { IDENTITY_REPOSITORY } from './ports/identity-repository.port';
import type {
  Credenciales,
  IdentityRepositoryPort,
} from './ports/identity-repository.port';

export interface RegisterCommand {
  registrationToken?: string;
  email?: string;
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
    @Inject(PURPOSE_TOKENS) private readonly purposeTokens: PurposeTokenPort,
  ) {}

  // El correo de bienvenida lo manda notificaciones y la vinculación de
  // pedidos hechos como invitado la hace orders, ambos reaccionando a
  // UsuarioRegistrado. La vinculación corre en esta misma transacción.
  async register(cmd: RegisterCommand) {
    const verificado = cmd.registrationToken
      ? this.purposeTokens.verificar('registro', cmd.registrationToken)
      : null;
    if (!verificado?.email) {
      throw new UnauthorizedError('Verifica tu correo para crear la cuenta.');
    }
    const email = verificado.email;
    if (cmd.email && cmd.email.toLowerCase() !== email.toLowerCase()) {
      throw new BusinessRuleViolation(
        'El correo no coincide con el verificado.',
      );
    }

    const existing = await this.identity.findUserByEmail(email);
    if (existing) throw new ConflictError('El correo ya está registrado.');

    const passwordHash = await this.hasher.hash(cmd.password);

    return this.uow.run(async () => {
      const user = await this.identity.createUser({
        email,
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

  private hashFicticioPromise: Promise<string> | null = null;

  private hashFicticio(): Promise<string> {
    this.hashFicticioPromise ??= this.hasher.hash(
      randomBytes(16).toString('hex'),
    );
    return this.hashFicticioPromise;
  }

  async login(cmd: { email: string; password: string }) {
    const GENERIC = 'Credenciales incorrectas.';

    const user = await this.identity.findUserByEmail(cmd.email);
    if (!user || !user.passwordHash) {
      // Tiempo constante: hace el mismo trabajo que con un usuario real.
      await this.hasher.verify(await this.hashFicticio(), cmd.password);
      throw new UnauthorizedError(GENERIC);
    }

    const valid = await this.hasher.verify(user.passwordHash, cmd.password);
    if (!valid) throw new UnauthorizedError(GENERIC);

    const tokens = await this.generateTokens(user);
    return { ...tokens, user: this.publicUser(user) };
  }

  async requestOtp(cmd: { email: string }) {
    await this.emitirOtp(cmd.email, PropositoOtp.LOGIN);
    return { message: 'Si el correo está registrado, recibirás un código.' };
  }

  async verifyOtp(cmd: { email: string; code: string }) {
    await this.verificarOtp(cmd.email, PropositoOtp.LOGIN, cmd.code);

    const user = await this.identity.findUserByEmail(cmd.email);
    if (!user) {
      const registrationToken = this.purposeTokens.firmar(
        'registro',
        { email: cmd.email },
        15 * 60,
      );
      return { requiresRegistration: true, registrationToken };
    }

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

  // Un solo código vivo por correo y propósito; si ya se emitieron
  // OTP_MAX_POR_VENTANA en la ventana, no emite nada (la respuesta al
  // cliente es la misma, así no se revela nada).
  private async emitirOtp(
    email: string,
    proposito: PropositoOtp,
  ): Promise<void> {
    const desde = new Date(Date.now() - OTP_VENTANA_MS);
    const emitidos = await this.identity.countOtpsSince(
      email,
      proposito,
      desde,
    );
    if (emitidos >= OTP_MAX_POR_VENTANA) return;

    const codigo = generarCodigoOtp();
    const codeHash = await this.hasher.hash(codigo);
    const expiresAt = new Date(Date.now() + OTP_VIGENCIA_MS);

    await this.uow.run(async () => {
      await this.identity.invalidateOtps(email, proposito);
      await this.identity.saveOtp({ email, proposito, codeHash, expiresAt });
      await this.events.publish(
        new CodigoDeAccesoSolicitado({ email, codigo }),
      );
    });
  }

  // El intento se reserva ANTES de comparar: así N adivinanzas en paralelo
  // no pueden superar OTP_MAX_INTENTOS por código.
  private async verificarOtp(
    email: string,
    proposito: PropositoOtp,
    code: string,
  ): Promise<void> {
    const invalido = () => new UnauthorizedError('Código inválido o expirado.');

    const otp = await this.identity.findLiveOtp(email, proposito);
    if (!otp) throw invalido();

    if (!(await this.identity.reserveOtpAttempt(otp.id, OTP_MAX_INTENTOS))) {
      throw invalido();
    }
    if (!(await this.hasher.verify(otp.hash, code))) throw invalido();
    if (!(await this.identity.consumeOtp(otp.id))) throw invalido();
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
