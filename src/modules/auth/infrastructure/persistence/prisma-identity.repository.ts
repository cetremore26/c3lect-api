import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import type { PropositoOtp } from '../../domain/otp-policy';
import {
  Credenciales,
  IdentityRepositoryPort,
  OtpVivo,
} from '../../application/ports/identity-repository.port';

const credencialesSelect = {
  id: true,
  email: true,
  nombre: true,
  rol: true,
  passwordHash: true,
} as const;

@Injectable()
export class PrismaIdentityRepository implements IdentityRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  findUserByEmail(email: string): Promise<Credenciales | null> {
    return this.db.client.user.findUnique({
      where: { email },
      select: credencialesSelect,
    });
  }

  findUserById(id: string): Promise<Credenciales | null> {
    return this.db.client.user.findUnique({
      where: { id },
      select: credencialesSelect,
    });
  }

  createUser(data: {
    email: string;
    passwordHash: string;
    nombre: string;
    telefono?: string;
  }): Promise<Credenciales> {
    return this.db.client.user.create({ data, select: credencialesSelect });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.db.client.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async saveRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.client.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  async findValidRefreshToken(tokenHash: string) {
    const record = await this.db.client.refreshToken.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
      select: { id: true, user: { select: credencialesSelect } },
    });
    return record;
  }

  async deleteRefreshToken(id: string): Promise<void> {
    await this.db.client.refreshToken.delete({ where: { id } });
  }

  async deleteRefreshTokensOf(userId: string): Promise<void> {
    await this.db.client.refreshToken.deleteMany({ where: { userId } });
  }

  countOtpsSince(
    email: string,
    proposito: PropositoOtp,
    desde: Date,
  ): Promise<number> {
    return this.db.client.otpCode.count({
      where: { email, proposito, createdAt: { gte: desde } },
    });
  }

  async invalidateOtps(email: string, proposito: PropositoOtp): Promise<void> {
    await this.db.client.otpCode.updateMany({
      where: { email, proposito, used: false },
      data: { used: true },
    });
  }

  async saveOtp(data: {
    email: string;
    proposito: PropositoOtp;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.db.client.otpCode.create({ data });
  }

  async findLiveOtp(
    email: string,
    proposito: PropositoOtp,
  ): Promise<OtpVivo | null> {
    const row = await this.db.client.otpCode.findFirst({
      where: { email, proposito, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true, intentos: true },
    });
    return row
      ? { id: row.id, hash: row.codeHash, intentos: row.intentos }
      : null;
  }

  async reserveOtpAttempt(id: string, maxIntentos: number): Promise<boolean> {
    const { count } = await this.db.client.otpCode.updateMany({
      where: { id, used: false, intentos: { lt: maxIntentos } },
      data: { intentos: { increment: 1 } },
    });
    return count === 1;
  }

  async consumeOtp(id: string): Promise<boolean> {
    const { count } = await this.db.client.otpCode.updateMany({
      where: { id, used: false },
      data: { used: true },
    });
    return count === 1;
  }

  async savePasswordReset(userId: string, tokenHash: string, expiresAt: Date) {
    await this.db.client.passwordReset.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  async findValidPasswordResets() {
    const rows = await this.db.client.passwordReset.findMany({
      where: { used: false, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true, tokenHash: true },
    });
    return rows.map((r) => ({ id: r.id, userId: r.userId, hash: r.tokenHash }));
  }

  async markPasswordResetUsed(id: string): Promise<void> {
    await this.db.client.passwordReset.update({
      where: { id },
      data: { used: true },
    });
  }
}
