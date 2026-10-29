// Lo único que otros módulos pueden importar de orders.
export { OrdersFacade } from './application/orders.facade';
export type {
  OrderSnapshot,
  ShippingData,
} from './application/ports/order-repository.port';
export type { PricedOrderItem, RequestedItem } from './domain/order-pricing';
export { EstadoPedido, MetodoPago } from './domain/order-status';
export {
  ConfirmacionDePedidoRevertida,
  EstadoDePedidoCambiado,
  PedidoConfirmado,
  PedidoCreado,
} from './domain/order-events';
export type {
  ClientePedido,
  LineaInventariable,
  LineaPedido,
} from './domain/order-events';
// Contrato HTTP compartido: payments recibe en su checkout los mismos items y
// datos de envío que orders, con la misma validación.
export { OrderItemDto } from './infrastructure/http/dto/order-item.dto';
export { ShippingInfoDto } from './infrastructure/http/dto/shipping-info.dto';
