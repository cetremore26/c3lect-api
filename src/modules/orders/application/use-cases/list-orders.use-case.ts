import { Inject, Injectable } from '@nestjs/common';
import { QueryOrdersDto } from '../../dto/query-orders.dto';
import { ORDER_REPOSITORY } from '../ports/order-repository.port';
import type { OrderRepositoryPort } from '../ports/order-repository.port';

@Injectable()
export class ListOrdersUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
  ) {}

  async execute(query: QueryOrdersDto, userId?: string, rol?: string) {
    const {
      status,
      fechaDesde,
      fechaHasta,
      search,
      page = 1,
      limit = 20,
    } = query;
    const skip = (page - 1) * limit;

    const { data, total } = await this.orders.findMany(
      {
        // Clientes solo ven sus propios pedidos
        userId: rol !== 'ADMIN' ? userId : undefined,
        status,
        fechaDesde: fechaDesde ? new Date(fechaDesde) : undefined,
        fechaHasta: fechaHasta
          ? new Date(fechaHasta + 'T23:59:59Z')
          : undefined,
        search: rol === 'ADMIN' ? search : undefined,
      },
      skip,
      limit,
    );

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
