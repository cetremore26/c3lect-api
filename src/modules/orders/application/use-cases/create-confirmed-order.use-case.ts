import { Inject, Injectable } from '@nestjs/common';
import { MetodoPago } from '@prisma/client';
import { AuditService } from '../../../audit/audit.service';
import { CreateOrderDto } from '../../dto/create-order.dto';
import { PricedOrderItem } from '../../domain/order-pricing';
import { ORDER_REPOSITORY } from '../ports/order-repository.port';
import type { OrderRepositoryPort } from '../ports/order-repository.port';

export interface CreateConfirmedOrderParams {
  orderNumber: string;
  itemsData: PricedOrderItem[];
  subtotal: number;
  total: number;
  shippingInfo: CreateOrderDto['shippingInfo'];
  userId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}

@Injectable()
export class CreateConfirmedOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    private readonly audit: AuditService,
  ) {}

  // Crea el pedido directamente en CONFIRMADO (sin pasar por PENDIENTE) y le
  // aplica el mismo descuento de stock + creación de ventas que una
  // confirmación normal. Lo usa el flujo de MercadoPago: el pedido solo
  // existe una vez que el webhook avisa que el pago fue aprobado — nunca
  // antes — así que no tiene sentido un estado PENDIENTE intermedio.
  async execute(params: CreateConfirmedOrderParams) {
    const order = await this.orders.createConfirmed({
      orderNumber: params.orderNumber,
      userId: params.userId ?? null,
      subtotal: params.subtotal,
      total: params.total,
      paymentMethod: MetodoPago.MERCADOPAGO,
      fbp: params.fbp ?? null,
      fbc: params.fbc ?? null,
      items: params.itemsData,
      shippingInfo: params.shippingInfo,
    });

    await this.audit.log(
      'ESTADO',
      'pedido',
      order.id,
      `Pedido ${order.orderNumber}: creado y confirmado vía MercadoPago`,
      'MERCADOPAGO',
    );

    return order;
  }
}
