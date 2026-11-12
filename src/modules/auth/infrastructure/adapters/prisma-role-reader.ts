import { Injectable } from '@nestjs/common';
import { RoleReaderPort } from '../../../../shared/application/ports/role-reader.port';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';

@Injectable()
export class PrismaRoleReader implements RoleReaderPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  async rolActual(userId: string): Promise<string | null> {
    const user = await this.db.client.user.findUnique({
      where: { id: userId },
      select: { rol: true },
    });
    return user?.rol ?? null;
  }
}
