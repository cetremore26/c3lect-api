import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import {
  Credenciales,
  IdentityRepositoryPort,
  SecretoPendiente,
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

  async saveOtp(email: string, codeHash: string, expiresAt: Date) {
    await this.db.client.otpCode.create({
      data: { email, codeHash, expiresAt },
    });
  }

  async findValidOtps(email: string): Promise<SecretoPendiente[]> {
    const rows = await this.db.client.otpCode.findMany({
      where: { email, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true },
    });
    return rows.map((r) => ({ id: r.id, hash: r.codeHash }));
  }

  async markOtpUsed(id: string): Promise<void> {
    await this.db.client.otpCode.update({
      where: { id },
      data: { used: true },
    });
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
