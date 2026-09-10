import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface NewAddressData {
  alias?: string;
  ciudad: string;
  departamento: string;
  direccion: string;
}

@Injectable()
export class AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nombre: true, email: true, telefono: true },
    });
  }

  updateProfile(userId: string, data: { nombre?: string; telefono?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { nombre: data.nombre, telefono: data.telefono },
      select: { id: true, nombre: true, email: true, telefono: true },
    });
  }

  listAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findAddressById(id: string) {
    return this.prisma.address.findUnique({ where: { id } });
  }

  countAddresses(userId: string) {
    return this.prisma.address.count({ where: { userId } });
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
      return this.prisma.address.create({
        data: { userId, ...data, esPrincipal: false },
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await this.clearPrincipal(tx, userId);
      return tx.address.create({
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
      return this.prisma.address.update({ where: { id }, data });
    }
    return this.prisma.$transaction(async (tx) => {
      await this.clearPrincipal(tx, userId);
      return tx.address.update({
        where: { id },
        data: { ...data, esPrincipal: true },
      });
    });
  }

  async setPrincipal(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.clearPrincipal(tx, userId);
      return tx.address.update({ where: { id }, data: { esPrincipal: true } });
    });
  }

  // Si se borró la principal y quedan otras, promueve la más antigua — nunca
  // deja al usuario sin dirección principal si todavía tiene alguna.
  async deleteAddress(userId: string, id: string, eraPrincipal: boolean) {
    await this.prisma.address.delete({ where: { id } });

    if (eraPrincipal) {
      const siguiente = await this.prisma.address.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (siguiente) {
        await this.prisma.address.update({
          where: { id: siguiente.id },
          data: { esPrincipal: true },
        });
      }
    }
  }

  private clearPrincipal(tx: Prisma.TransactionClient, userId: string) {
    return tx.address.updateMany({
      where: { userId, esPrincipal: true },
      data: { esPrincipal: false },
    });
  }
}
