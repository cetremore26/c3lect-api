import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG } from '../../../../shared/application/ports/audit-log.port';
import type { AuditLogPort } from '../../../../shared/application/ports/audit-log.port';
import { EVENT_BUS } from '../../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../../shared/application/ports/event-bus.port';
import { UNIT_OF_WORK } from '../../../../shared/application/ports/unit-of-work.port';
import type { UnitOfWorkPort } from '../../../../shared/application/ports/unit-of-work.port';
import { PedidoConfirmado } from '../../domain/order-events';
import { PricedOrderItem } from '../../domain/order-pricing';
import { MetodoPago } from '../../domain/order-status';
import { toLineasInventariables } from '../order-lines';
import { ORDER_PRODUCT_CATALOG } from '../ports/order-product-catalog.port';
import type { OrderProductCatalogPort } from '../ports/order-product-catalog.port';
import { ORDER_REPOSITORY } from '../ports/order-repository.port';
import type {
  OrderRepositoryPort,
  ShippingData,
} from '../ports/order-repository.port';

export interface CreateConfirmedOrderParams {
  orderNumber: string;
  itemsData: PricedOrderItem[];
  subtotal: number;
  total: number;
  shippingInfo: ShippingData;
  userId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}

@Injectable()
export class CreateConfirmedOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(ORDER_PRODUCT_CATALOG)
    private readonly catalog: OrderProductCatalogPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
  ) {}

  // Crea el pedido directamente en CONFIRMADO (sin pasar por PENDIENTE). Lo
  // usa el flujo de MercadoPago: el pedido solo existe una vez que el webhook
  // avisa que el pago fue aprobado — nunca antes. PedidoConfirmado se publica
  // dentro de la misma transacción, así que si inventario rechaza por falta
  // de stock, el pedido tampoco queda creado.
  async execute(params: CreateConfirmedOrderParams) {
    const order = await this.uow.run(async () => {
      const created = await this.orders.createConfirmed(
        {
          orderNumber: params.orderNumber,
          userId: params.userId ?? null,
          subtotal: params.subtotal,
          total: params.total,
          paymentMethod: MetodoPago.MERCADOPAGO,
          fbp: params.fbp ?? null,
          fbc: params.fbc ?? null,
          items: params.itemsData,
          shippingInfo: params.shippingInfo,
        },
        'MERCADOPAGO',
      );

      await this.events.publish(
        new PedidoConfirmado({
          orderId: created.id,
          orderNumber: created.orderNumber,
          cliente: params.shippingInfo.nombreCompleto,
          celular: params.shippingInfo.telefono,
          lineas: await toLineasInventariables(this.catalog, created.items),
        }),
      );

      return created;
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
