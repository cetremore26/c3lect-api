import { Injectable } from '@nestjs/common';
import type {
  ComprasDelClientePort,
  ProductoRecibido,
} from '../../application/ports/compras-del-cliente.port';
import { OrdersFacade } from '../../../orders/public-api';

@Injectable()
export class OrdersComprasDelCliente implements ComprasDelClientePort {
  constructor(private readonly orders: OrdersFacade) {}

  productosRecibidos(userId: string): Promise<ProductoRecibido[]> {
    return this.orders.productosRecibidos(userId);
  }
}
