export const CUSTOMER_ORDERS = Symbol('CUSTOMER_ORDERS');

export interface CustomerOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: Date;
  items: { nombre: string; cantidad: number }[];
}

// Los pedidos son del contexto orders: el listado de clientes solo los
// consulta por aquí para mostrar historial y totales.
export interface CustomerOrdersPort {
  /** Totales de pedidos agrupados por usuario. */
  totalsByUser(userIds: string[]): Promise<Map<string, { total: number }[]>>;
  /** Pedidos de un usuario, del más reciente al más antiguo. */
  listByUser(userId: string): Promise<CustomerOrderSummary[]>;
}
