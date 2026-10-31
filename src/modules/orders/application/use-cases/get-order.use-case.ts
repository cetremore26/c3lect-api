import { Inject, Injectable } from '@nestjs/common';
import {
  ForbiddenError,
  NotFoundError,
} from '../../../../shared/domain/domain-error';
import { OrderStatusTransition } from '../../domain/order-status';
import { Requester } from '../commands';
import { ORDER_REPOSITORY } from '../ports/order-repository.port';
import type { OrderRepositoryPort } from '../ports/order-repository.port';

@Injectable()
export class GetOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
  ) {}

  async execute(id: string, { userId, rol }: Requester) {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundError('Pedido no encontrado.');

    if (rol !== 'ADMIN' && order.userId !== userId) {
      throw new ForbiddenError('No tienes permiso para ver este pedido.');
    }

    // La UI ofrece solo los cambios de estado que la máquina de estados
    // permite, en vez de mantener su propia copia de las reglas.
    return {
      ...order,
      transicionesPermitidas: OrderStatusTransition.permitidasDesde(
        order.status,
      ),
    };
  }
}
