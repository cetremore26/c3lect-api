import { Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { buildOrderNumber } from './domain/order-number';
import { RequestedItem } from './domain/order-pricing';
import {
  CreateConfirmedOrderParams,
  CreateConfirmedOrderUseCase,
} from './application/use-cases/create-confirmed-order.use-case';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { GetOrderUseCase } from './application/use-cases/get-order.use-case';
import { LinkGuestOrdersUseCase } from './application/use-cases/link-guest-orders.use-case';
import { ListOrdersUseCase } from './application/use-cases/list-orders.use-case';
import { ResolveOrderItemsUseCase } from './application/use-cases/resolve-order-items.use-case';
import { UpdateOrderStatusUseCase } from './application/use-cases/update-order-status.use-case';

export { buildOrderNumber };

// Fachada: mantiene la API pública histórica de OrdersService (usada por
// OrdersController y por PaymentsService) y delega cada método al caso de
// uso correspondiente. La lógica de negocio real vive en application/ y
// domain/ — ver el módulo orders para el detalle de capas.
@Injectable()
export class OrdersService {
  constructor(
    private readonly resolveOrderItemsUseCase: ResolveOrderItemsUseCase,
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly createConfirmedOrderUseCase: CreateConfirmedOrderUseCase,
    private readonly updateOrderStatusUseCase: UpdateOrderStatusUseCase,
    private readonly listOrdersUseCase: ListOrdersUseCase,
    private readonly getOrderUseCase: GetOrderUseCase,
    private readonly linkGuestOrdersUseCase: LinkGuestOrdersUseCase,
  ) {}

  resolveItems(items: RequestedItem[], autenticado = false) {
    return this.resolveOrderItemsUseCase.execute(items, autenticado);
  }

  createOrder(dto: CreateOrderDto, userId?: string) {
    return this.createOrderUseCase.execute(dto, userId);
  }

  createConfirmedOrder(params: CreateConfirmedOrderParams) {
    return this.createConfirmedOrderUseCase.execute(params);
  }

  findAll(query: QueryOrdersDto, userId?: string, rol?: string) {
    return this.listOrdersUseCase.execute(query, userId, rol);
  }

  findOne(id: string, userId?: string, rol?: string) {
    return this.getOrderUseCase.execute(id, userId, rol);
  }

  updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    adminId: string,
    skipStatusEmail = false,
  ) {
    return this.updateOrderStatusUseCase.execute(
      id,
      dto,
      adminId,
      skipStatusEmail,
    );
  }

  linkGuestOrders(email: string, userId: string): Promise<void> {
    return this.linkGuestOrdersUseCase.execute(email, userId);
  }
}
