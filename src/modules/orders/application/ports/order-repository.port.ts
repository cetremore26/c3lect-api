import type { EstadoPedido, MetodoPago } from '../../domain/order-status';

// Modelos de lectura del pedido, en vocabulario propio. Antes eran
// Prisma.OrderGetPayload<...>: cambiar de ORM obligaba a tocar los casos de
// uso. La forma coincide con lo que devuelve la API, así que el JSON que ve
// el frontend no cambió.

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export interface ShippingData {
  nombreCompleto: string;
  email: string;
  telefono: string;
  ciudad: string;
  departamento: string;
  direccion: string;
  notas?: string | null;
}

export interface OrderItemData {
  productId: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  subtotal: number;
}

export interface StatusHistoryEntry {
  id: string;
  orderId: string;
  statusAnterior: EstadoPedido | null;
  statusNuevo: EstadoPedido;
  changedBy: string | null;
  createdAt: Date;
}

export interface OrderSnapshot {
  id: string;
  orderNumber: string;
  userId: string | null;
  status: EstadoPedido;
  subtotal: number;
  total: number;
  paymentMethod: MetodoPago;
  fbp: string | null;
  fbc: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: (OrderItemData & { id: string; orderId: string })[];
  shippingInfo:
    | (ShippingData & { id: string; orderId: string; notas: string | null })
    | null;
}

export interface OrderUserRef {
  id: string;
  email: string;
  nombre: string;
}

export type OrderListItem = OrderSnapshot & { user: OrderUserRef | null };
export type OrderDetail = OrderListItem & {
  statusHistory: StatusHistoryEntry[];
};
export type CreatedOrder = OrderSnapshot & {
  statusHistory: StatusHistoryEntry[];
};
export type OrderForStatusTransition = OrderSnapshot & {
  user: { nombre: string } | null;
};

export interface OrderListFilter {
  userId?: string;
  status?: EstadoPedido;
  fechaDesde?: Date;
  fechaHasta?: Date;
  /** Solo aplica junto a búsqueda habilitada para admins. */
  search?: string;
}

export interface NewOrderData {
  orderNumber: string;
  userId: string | null;
  subtotal: number;
  total: number;
  paymentMethod: MetodoPago;
  fbp: string | null;
  fbc: string | null;
  items: OrderItemData[];
  shippingInfo: ShippingData;
}

export interface UserOrderSummary {
  id: string;
  orderNumber: string;
  status: EstadoPedido;
  total: number;
  createdAt: Date;
  items: { nombre: string; cantidad: number }[];
}

// Solo persistencia de pedidos y sus tablas hijas (items, envío, historial).
// El stock y las ventas ya no se tocan aquí: son de inventario y ventas, que
// reaccionan a PedidoConfirmado dentro de la misma unidad de trabajo.
export interface OrderRepositoryPort {
  findMany(
    filter: OrderListFilter,
    skip: number,
    take: number,
  ): Promise<{ data: OrderListItem[]; total: number }>;

  findById(id: string): Promise<OrderDetail | null>;

  findByIdForStatusTransition(
    id: string,
  ): Promise<OrderForStatusTransition | null>;

  findByIdForPayment(id: string): Promise<OrderSnapshot | null>;

  create(data: NewOrderData): Promise<CreatedOrder>;

  /** Crea el pedido directamente en CONFIRMADO, con su historial. */
  createConfirmed(data: NewOrderData, changedBy: string): Promise<CreatedOrder>;

  /** Cambia el estado y agrega la fila de historial. */
  transitionStatus(params: {
    orderId: string;
    statusAnterior: EstadoPedido;
    statusNuevo: EstadoPedido;
    changedBy: string;
  }): Promise<OrderForStatusTransition>;

  linkGuestOrders(email: string, userId: string): Promise<void>;

  totalsByUser(userIds: string[]): Promise<{ userId: string; total: number }[]>;

  listByUser(userId: string): Promise<UserOrderSummary[]>;
}
