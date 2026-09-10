import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const listSelect = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  createdAt: true,
  _count: { select: { orders: true } },
  orders: { select: { total: true } },
} satisfies Prisma.UserSelect;

const detailSelect = {
  id: true,
  nombre: true,
  email: true,
  telefono: true,
  ciudad: true,
  departamento: true,
  direccion: true,
  rol: true,
  createdAt: true,
  orders: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      createdAt: true,
      items: { select: { nombre: true, cantidad: true } },
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.UserSelect;

export type UserListItem = Prisma.UserGetPayload<{ select: typeof listSelect }>;
export type UserDetail = Prisma.UserGetPayload<{ select: typeof detailSelect }>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllPaginated(
    where: Prisma.UserWhereInput,
    skip: number,
    take: number,
  ): Promise<{ data: UserListItem[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: listSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total };
  }

  findByIdWithOrders(id: string): Promise<UserDetail | null> {
    return this.prisma.user.findUnique({ where: { id }, select: detailSelect });
  }
}
