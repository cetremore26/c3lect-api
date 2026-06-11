import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('El correo ya está registrado.');

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        nombre: dto.nombre,
        telefono: dto.telefono,
      },
    });

    const tokens = await this.generateTokens(user);
    void this.mail.sendWelcome(user.email, user.nombre);

    // Link any guest orders that used the same email
    await this.prisma.order.updateMany({
      where: { userId: null, shippingInfo: { email: dto.email } },
      data: { userId: user.id },
    });

    return {
      ...tokens,
      user: { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
    };
  }

  async login(dto: LoginDto) {
    const GENERIC = 'Credenciales incorrectas.';

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) throw new UnauthorizedException(GENERIC);

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException(GENERIC);

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
    };
  }

  async requestOtp(dto: RequestOtpDto) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await argon2.hash(code, { type: argon2.argon2id });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.otpCode.create({ data: { email: dto.email, codeHash, expiresAt } });
    void this.mail.sendOtp(dto.email, code);

    return { message: 'Si el correo está registrado, recibirás un código.' };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const records = await this.prisma.otpCode.findMany({
      where: { email: dto.email, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    let matchedId: string | null = null;
    for (const record of records) {
      if (await argon2.verify(record.codeHash, dto.code)) {
        matchedId = record.id;
        break;
      }
    }
    if (!matchedId) throw new UnauthorizedException('Código inválido o expirado.');

    await this.prisma.otpCode.update({ where: { id: matchedId }, data: { used: true } });

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) return { requiresRegistration: true };

    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
    };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (user) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = await argon2.hash(rawToken, { type: argon2.argon2id });
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await this.prisma.passwordReset.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      const frontendUrl = this.config.get<string>('FRONTEND_URL');
      const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
      void this.mail.sendPasswordReset(user.email, resetUrl);
    }

    return { message: 'Si el correo está registrado, recibirás un enlace.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const records = await this.prisma.passwordReset.findMany({
      where: { used: false, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    let matched: (typeof records)[number] | null = null;
    for (const record of records) {
      if (await argon2.verify(record.tokenHash, dto.token)) {
        matched = record;
        break;
      }
    }
    if (!matched) throw new UnauthorizedException('Token inválido o expirado.');

    const passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: matched.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordReset.update({
        where: { id: matched.id },
        data: { used: true },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: matched.userId } }),
    ]);

    return { message: 'Contraseña actualizada correctamente.' };
  }

  async refreshTokens(dto: RefreshTokenDto) {
    const tokenHash = createHash('sha256').update(dto.refreshToken).digest('hex');

    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!record) throw new UnauthorizedException('Refresh token inválido o expirado.');

    await this.prisma.refreshToken.delete({ where: { id: record.id } });

    return this.generateTokens(record.user);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Usuario no encontrado.');
    return { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol };
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { message: 'Sesión cerrada.' };
  }

  private async generateTokens(user: { id: string; email: string; rol: string }) {
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, rol: user.rol },
    );

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = this.parseExpiry(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    );

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    return { accessToken, refreshToken: rawToken };
  }

  private parseExpiry(expiry: string): Date {
    const now = new Date();
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1), 10);
    switch (unit) {
      case 'd': now.setDate(now.getDate() + value); break;
      case 'h': now.setHours(now.getHours() + value); break;
      case 'm': now.setMinutes(now.getMinutes() + value); break;
      case 's': now.setSeconds(now.getSeconds() + value); break;
      default:  now.setDate(now.getDate() + 7);
    }
    return now;
  }
}
