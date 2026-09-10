import { EstadoPedido, MetodoPago, Prisma } from '@prisma/client';

// El puerto solo importa *tipos* generados por Prisma (vocabulario de datos
// compartido, igual que ya hace ProductsService con Prisma.ProductWhereInput)
// — nunca el PrismaClient/query-builder en sí. Eso es lo que se confina a
// infrastructure/.

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export type OrderListItem = Prisma.OrderGetPayload<{
  include: {
    items: true;
    shippingInfo: true;
    user: { select: { id: true; email: true; nombre: true } };
  };
}>;
export type OrderDetail = Prisma.OrderGetPayload<{
  include: {
    items: true;
    shippingInfo: true;
    statusHistory: true;
    user: { select: { id: true; email: true; nombre: true } };
  };
}>;
export type OrderForStatusTransition = Prisma.OrderGetPayload<{
  include: { items: true; shippingInfo: true; user: true };
}>;
export type CreatedOrder = Prisma.OrderGetPayload<{
  include: { items: true; shippingInfo: true; statusHistory: true };
}>;
export type OrderForPayment = Prisma.OrderGetPayload<{
  include: { items: true; shippingInfo: true };
}>;

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
  items: {
    productId: string;
    nombre: string;
    precioUnitario: number;
    cantidad: number;
    subtotal: number;
  }[];
  shippingInfo: Prisma.ShippingInfoCreateWithoutOrderInput;
}

export type NewConfirmedOrderData = NewOrderData;

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

  /** Shape mínimo que necesita PaymentsService para crear una preferencia o decidir si cancela. */
  findByIdForPayment(id: string): Promise<OrderForPayment | null>;

  create(data: NewOrderData): Promise<CreatedOrder>;

  /** Crea el pedido ya en CONFIRMADO y aplica el mismo descuento de stock + registro de ventas que una confirmación normal, todo en una sola transacción atómica. */
  createConfirmed(data: NewConfirmedOrderData): Promise<CreatedOrder>;

  /**
   * Aplica un cambio de estado (update + historial) y, si corresponde según
   * la máquina de estados de dominio, el descuento/reversión de stock y el
   * registro/borrado de ventas — todo en una única transacción atómica.
   * Devuelve el pedido con los datos necesarios para notificar al cliente.
   */
  transitionStatus(params: {
    orderId: string;
    statusAnterior: EstadoPedido;
    statusNuevo: EstadoPedido;
    changedBy: string;
    aplicarConfirmacion: boolean;
    revertirConfirmacion: boolean;
  }): Promise<OrderForStatusTransition>;

  linkGuestOrders(email: string, userId: string): Promise<void>;
}
