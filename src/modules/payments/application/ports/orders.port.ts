export const ORDERS = Symbol('ORDERS');

export interface ShippingSnapshot {
  nombreCompleto: string;
  email: string;
  telefono: string;
  ciudad: string;
  departamento: string;
  direccion: string;
  notas?: string | null;
}

export interface LineaCotizada {
  productId: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  subtotal: number;
}

export interface PedidoParaPago {
  id: string;
  orderNumber: string;
  /** Solo un pedido PENDIENTE puede pagarse, confirmarse o cancelarse por pago. */
  pendiente: boolean;
  total: number;
  fbp: string | null;
  fbc: string | null;
  items: LineaCotizada[];
  shippingInfo: Omit<ShippingSnapshot, 'direccion' | 'notas'> | null;
}

// Lo que payments necesita del contexto de pedidos, en sus propios términos.
// Lo implementa un adaptador sobre la API pública de orders.
export interface OrdersPort {
  cotizar(
    items: { productId: string; cantidad: number }[],
    autenticado: boolean,
  ): Promise<{ itemsData: LineaCotizada[]; subtotal: number; total: number }>;

  nuevoNumeroDePedido(): string;

  findForPayment(orderId: string): Promise<PedidoParaPago | null>;

  confirmarPorPago(orderId: string): Promise<void>;

  cancelarPorPago(orderId: string): Promise<void>;

  crearConfirmadoPorPago(params: {
    orderNumber: string;
    itemsData: LineaCotizada[];
    subtotal: number;
    total: number;
    shippingInfo: ShippingSnapshot;
    userId: string | null;
    fbp?: string | null;
    fbc?: string | null;
  }): Promise<PedidoParaPago>;
}
