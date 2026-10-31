import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import {
  UserListRow,
  UserProfile,
  UsersRepositoryPort,
} from '../../application/ports/users-repository.port';

const listSelect = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const profileSelect = {
  ...listSelect,
  telefono: true,
  ciudad: true,
  departamento: true,
  direccion: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersRepository implements UsersRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  async findAllPaginated(
    filter: { search?: string },
    skip: number,
    take: number,
  ): Promise<{ data: UserListRow[]; total: number }> {
    const where: Prisma.UserWhereInput = filter.search
      ? {
          OR: [
            { nombre: { contains: filter.search, mode: 'insensitive' } },
            { email: { contains: filter.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.db.client.user.findMany({
        where,
        select: listSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.db.client.user.count({ where }),
    ]);
    return { data, total };
  }

  findById(id: string): Promise<UserProfile | null> {
    return this.db.client.user.findUnique({
      where: { id },
      select: profileSelect,
    });
  }

  async findNombre(id: string): Promise<string | undefined> {
    const user = await this.db.client.user.findUnique({
      where: { id },
      select: { nombre: true },
    });
    return user?.nombre;
  }
}
