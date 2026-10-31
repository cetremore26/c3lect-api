import type { RequestedItem } from '../domain/order-pricing';
import type { EstadoPedido, MetodoPago } from '../domain/order-status';
import type { ShippingData } from './ports/order-repository.port';

// Entradas de los casos de uso, sin decoradores de validación. Los DTOs HTTP
// (infrastructure/http/dto) las implementan; la validación es asunto del
// adaptador HTTP, no de la aplicación.

export interface CreateOrderCommand {
  metodoPago: MetodoPago;
  items: RequestedItem[];
  shippingInfo: ShippingData;
  fbp?: string;
  fbc?: string;
}

export interface ListOrdersQuery {
  status?: EstadoPedido;
  fechaDesde?: string;
  fechaHasta?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/** Quién pide la operación, tal como lo dejó el guard JWT. */
export interface Requester {
  userId?: string;
  rol?: string;
}
