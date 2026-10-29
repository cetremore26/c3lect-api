import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG } from '../../../../shared/application/ports/audit-log.port';
import type { AuditLogPort } from '../../../../shared/application/ports/audit-log.port';
import { EVENT_BUS } from '../../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../../shared/application/ports/event-bus.port';
import { UNIT_OF_WORK } from '../../../../shared/application/ports/unit-of-work.port';
import type { UnitOfWorkPort } from '../../../../shared/application/ports/unit-of-work.port';
import { NotFoundError } from '../../../../shared/domain/domain-error';
import {
  ConfirmacionDePedidoRevertida,
  EstadoDePedidoCambiado,
  PedidoConfirmado,
} from '../../domain/order-events';
import { EstadoPedido, OrderStatusTransition } from '../../domain/order-status';
import { toLineasInventariables } from '../order-lines';
import { ORDER_PRODUCT_CATALOG } from '../ports/order-product-catalog.port';
import type { OrderProductCatalogPort } from '../ports/order-product-catalog.port';
import { ORDER_REPOSITORY } from '../ports/order-repository.port';
import type { OrderRepositoryPort } from '../ports/order-repository.port';

@Injectable()
export class UpdateOrderStatusUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(ORDER_PRODUCT_CATALOG)
    private readonly catalog: OrderProductCatalogPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
  ) {}

  // `notificar=false` solo lo usa el flujo de MercadoPago para la transición
  // PENDIENTE→CONFIRMADO automática: ahí el cliente y el admin ya reciben el
  // comprobante de pago, así que avisar el cambio de estado sería duplicado.
  async execute(
    id: string,
    nuevoEstado: EstadoPedido,
    changedBy: string,
    { notificar = true }: { notificar?: boolean } = {},
  ) {
    const order = await this.orders.findByIdForStatusTransition(id);
    if (!order) throw new NotFoundError('Pedido no encontrado.');

    OrderStatusTransition.assertValid(order.status, nuevoEstado);

    // Cambio de estado + efectos en inventario/ventas en una sola
    // transacción: los handlers `in-transaction` de PedidoConfirmado y
    // ConfirmacionDePedidoRevertida corren dentro de esta unidad de trabajo.
    await this.uow.run(async () => {
      const updated = await this.orders.transitionStatus({
        orderId: id,
        statusAnterior: order.status,
        statusNuevo: nuevoEstado,
        changedBy,
      });

      if (OrderStatusTransition.seConfirma(order.status, nuevoEstado)) {
        await this.events.publish(
          new PedidoConfirmado({
            orderId: id,
            orderNumber: updated.orderNumber,
            cliente:
              updated.shippingInfo?.nombreCompleto ??
              updated.user?.nombre ??
              'Cliente',
            celular: updated.shippingInfo?.telefono ?? null,
            lineas: await toLineasInventariables(this.catalog, updated.items),
          }),
        );
      } else if (
        OrderStatusTransition.seCancelaConStockDescontado(
          order.status,
          nuevoEstado,
        )
      ) {
        await this.events.publish(
          new ConfirmacionDePedidoRevertida({
            orderId: id,
            orderNumber: updated.orderNumber,
            lineas: await toLineasInventariables(this.catalog, updated.items),
          }),
        );
      }

      await this.events.publish(
        new EstadoDePedidoCambiado({
          orderId: id,
          orderNumber: updated.orderNumber,
          estadoAnterior: order.status,
          estadoNuevo: nuevoEstado,
          emailCliente: updated.shippingInfo?.email ?? null,
          nombreCliente:
            updated.shippingInfo?.nombreCompleto ??
            updated.user?.nombre ??
            'Cliente',
          notificar,
        }),
      );
    });

    await this.audit.log(
      'ESTADO',
      'pedido',
      id,
      `Pedido ${order.orderNumber}: ${order.status} → ${nuevoEstado}`,
      changedBy,
    );

    return { message: `Pedido actualizado a ${nuevoEstado}.` };
  }
}
