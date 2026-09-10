import { Inject, Injectable } from '@nestjs/common';
import { ORDER_REPOSITORY } from '../ports/order-repository.port';
import type { OrderRepositoryPort } from '../ports/order-repository.port';

@Injectable()
export class LinkGuestOrdersUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
  ) {}

  execute(email: string, userId: string): Promise<void> {
    return this.orders.linkGuestOrders(email, userId);
  }
}
