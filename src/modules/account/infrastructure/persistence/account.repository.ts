import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import {
  AccountRepositoryPort,
  NewAddressData,
} from '../../application/ports/account-repository.port';

@Injectable()
export class AccountRepository implements AccountRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  getProfile(userId: string) {
    return this.db.client.user.findUnique({
      where: { id: userId },
      select: { id: true, nombre: true, email: true, telefono: true },
    });
  }

  updateProfile(userId: string, data: { nombre?: string; telefono?: string }) {
    return this.db.client.user.update({
      where: { id: userId },
      data: { nombre: data.nombre, telefono: data.telefono },
      select: { id: true, nombre: true, email: true, telefono: true },
    });
  }

  listAddresses(userId: string) {
    return this.db.client.address.findMany({
      where: { userId },
      orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findAddressById(id: string) {
    return this.db.client.address.findUnique({ where: { id } });
  }

  countAddresses(userId: string) {
    return this.db.client.address.count({ where: { userId } });
  }

  // La primera dirección de un usuario siempre queda como principal, y crear
  // o marcar una nueva principal siempre desmarca las demás — la única
  // invariante real de este módulo, antes copiada en cada método que podía
  // tocar `esPrincipal`. Ahora vive en un solo lugar: `clearPrincipal`.
  async createAddress(
    userId: string,
    data: NewAddressData,
    esPrincipal: boolean,
  ) {
    if (!esPrincipal) {
      return this.db.client.address.create({
        data: { userId, ...data, esPrincipal: false },
      });
    }
    return this.db.run(async () => {
      await this.clearPrincipal(userId);
      return this.db.client.address.create({
        data: { userId, ...data, esPrincipal: true },
      });
    });
  }

  async updateAddress(
    userId: string,
    id: string,
    data: Partial<NewAddressData>,
    marcarPrincipal: boolean,
  ) {
    if (!marcarPrincipal) {
      return this.db.client.address.update({ where: { id }, data });
    }
    return this.db.run(async () => {
      await this.clearPrincipal(userId);
      return this.db.client.address.update({
        where: { id },
        data: { ...data, esPrincipal: true },
      });
    });
  }

  async setPrincipal(userId: string, id: string) {
    return this.db.run(async () => {
      await this.clearPrincipal(userId);
      return this.db.client.address.update({
        where: { id },
        data: { esPrincipal: true },
      });
    });
  }

  // Si se borró la principal y quedan otras, promueve la más antigua — nunca
  // deja al usuario sin dirección principal si todavía tiene alguna.
  async deleteAddress(userId: string, id: string, eraPrincipal: boolean) {
    await this.db.client.address.delete({ where: { id } });

    if (eraPrincipal) {
      const siguiente = await this.db.client.address.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (siguiente) {
        await this.db.client.address.update({
          where: { id: siguiente.id },
          data: { esPrincipal: true },
        });
      }
    }
  }

  private clearPrincipal(userId: string) {
    return this.db.client.address.updateMany({
      where: { userId, esPrincipal: true },
      data: { esPrincipal: false },
    });
  }
}
