import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ORDER_REPOSITORY } from '../ports/order-repository.port';
import type { OrderRepositoryPort } from '../ports/order-repository.port';

@Injectable()
export class GetOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
  ) {}

  async execute(id: string, userId?: string, rol?: string) {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundException('Pedido no encontrado.');

    if (rol !== 'ADMIN' && order.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para ver este pedido.');
    }

    return order;
  }
}
