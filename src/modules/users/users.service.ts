import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsersRepository } from './users.repository';
import { calcularTotalGastado } from './users.util';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findAll(search?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { nombre: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const { data: users, total } = await this.usersRepository.findAllPaginated(
      where,
      skip,
      limit,
    );

    const data = users.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      createdAt: u.createdAt,
      totalPedidos: u._count.orders,
      totalGastado: calcularTotalGastado(u.orders),
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const user = await this.usersRepository.findByIdWithOrders(id);
    if (!user) throw new NotFoundException('Cliente no encontrado.');

    return { ...user, totalGastado: calcularTotalGastado(user.orders) };
  }
}
