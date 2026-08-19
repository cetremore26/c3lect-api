import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nombre: true, email: true, telefono: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { nombre: dto.nombre, telefono: dto.telefono },
      select: { id: true, nombre: true, email: true, telefono: true },
    });
    return user;
  }

  listAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }],
    });
  }

  // Verifica que la dirección exista y sea del usuario — nunca deja que un
  // cliente lea/edite/borre la dirección de otro por id adivinado.
  private async requireOwnAddress(userId: string, id: string) {
    const address = await this.prisma.address.findUnique({ where: { id } });
    if (!address) throw new NotFoundException('Dirección no encontrada.');
    if (address.userId !== userId)
      throw new ForbiddenException('No tienes permiso sobre esta dirección.');
    return address;
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    const totalExistentes = await this.prisma.address.count({
      where: { userId },
    });
    // La primera dirección de un usuario siempre queda como principal, haya
    // o no marcado la casilla — nunca debe quedar un usuario sin ninguna.
    const esPrincipal = totalExistentes === 0 || dto.esPrincipal === true;

    if (esPrincipal) {
      return this.prisma.$transaction(async (tx) => {
        await tx.address.updateMany({
          where: { userId, esPrincipal: true },
          data: { esPrincipal: false },
        });
        return tx.address.create({
          data: {
            userId,
            alias: dto.alias,
            ciudad: dto.ciudad,
            departamento: dto.departamento,
            direccion: dto.direccion,
            esPrincipal: true,
          },
        });
      });
    }

    return this.prisma.address.create({
      data: {
        userId,
        alias: dto.alias,
        ciudad: dto.ciudad,
        departamento: dto.departamento,
        direccion: dto.direccion,
        esPrincipal: false,
      },
    });
  }

  async updateAddress(userId: string, id: string, dto: UpdateAddressDto) {
    await this.requireOwnAddress(userId, id);

    if (dto.esPrincipal === true) {
      return this.prisma.$transaction(async (tx) => {
        await tx.address.updateMany({
          where: { userId, esPrincipal: true },
          data: { esPrincipal: false },
        });
        return tx.address.update({
          where: { id },
          data: {
            alias: dto.alias,
            ciudad: dto.ciudad,
            departamento: dto.departamento,
            direccion: dto.direccion,
            esPrincipal: true,
          },
        });
      });
    }

    return this.prisma.address.update({
      where: { id },
      data: {
        alias: dto.alias,
        ciudad: dto.ciudad,
        departamento: dto.departamento,
        direccion: dto.direccion,
      },
    });
  }

  async setPrincipal(userId: string, id: string) {
    await this.requireOwnAddress(userId, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId, esPrincipal: true },
        data: { esPrincipal: false },
      });
      return tx.address.update({ where: { id }, data: { esPrincipal: true } });
    });
  }

  async deleteAddress(userId: string, id: string) {
    const address = await this.requireOwnAddress(userId, id);
    await this.prisma.address.delete({ where: { id } });

    // Si borró la principal y le quedan otras, promueve la más antigua —
    // nunca deja al usuario sin dirección principal si todavía tiene alguna.
    if (address.esPrincipal) {
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

    return { message: 'Dirección eliminada.' };
  }
}
