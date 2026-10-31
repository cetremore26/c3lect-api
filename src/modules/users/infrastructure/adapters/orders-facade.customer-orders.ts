import { Injectable } from '@nestjs/common';
import type {
  CustomerOrderSummary,
  CustomerOrdersPort,
} from '../../application/ports/customer-orders.port';
import { OrdersFacade } from '../../../orders/public-api';

@Injectable()
export class OrdersFacadeCustomerOrders implements CustomerOrdersPort {
  constructor(private readonly orders: OrdersFacade) {}

  async totalsByUser(
    userIds: string[],
  ): Promise<Map<string, { total: number }[]>> {
    const rows = await this.orders.totalsByUser(userIds);
    const map = new Map<string, { total: number }[]>();
    for (const row of rows) {
      const list = map.get(row.userId) ?? [];
      list.push({ total: row.total });
      map.set(row.userId, list);
    }
    return map;
  }

  listByUser(userId: string): Promise<CustomerOrderSummary[]> {
    return this.orders.listByUser(userId);
  }
}
