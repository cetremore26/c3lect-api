import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../shared/domain/domain-error';
import { calcularTotalGastado } from '../domain/users.util';
import { CUSTOMER_ORDERS } from './ports/customer-orders.port';
import type { CustomerOrdersPort } from './ports/customer-orders.port';
import { USERS_REPOSITORY } from './ports/users-repository.port';
import type { UsersRepositoryPort } from './ports/users-repository.port';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
    @Inject(CUSTOMER_ORDERS) private readonly orders: CustomerOrdersPort,
  ) {}

  async findAll(search?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const { data: users, total } = await this.usersRepository.findAllPaginated(
      { search },
      skip,
      limit,
    );
    const ordersByUser = await this.orders.totalsByUser(users.map((u) => u.id));

    const data = users.map((u) => {
      const orders = ordersByUser.get(u.id) ?? [];
      return {
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        createdAt: u.createdAt,
        totalPedidos: orders.length,
        totalGastado: calcularTotalGastado(orders),
      };
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundError('Cliente no encontrado.');

    const orders = await this.orders.listByUser(id);
    return { ...user, orders, totalGastado: calcularTotalGastado(orders) };
  }
}
