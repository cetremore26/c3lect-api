import type { DomainEvent } from '../../../shared/domain/domain-event';
import type { EstadoPedido, MetodoPago } from './order-status';

// Hechos que publica el contexto de pedidos. Son su contrato público: otros
// módulos reaccionan a ellos (inventario, ventas, notificaciones, Meta) sin
// que orders sepa que existen.

export interface ClientePedido {
  email: string;
  nombreCompleto: string;
  telefono: string;
  ciudad: string;
  departamento: string;
}

export interface LineaPedido {
  productId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

/** Línea con la identidad de inventario (marca/modelo) ya resuelta. */
export interface LineaInventariable {
  productId: string;
  /** Product.nombre ("Marca Modelo"); también es el fallback legado de modelo. */
  nombre: string;
  marca: string | null;
  modelo: string;
  cantidad: number;
  precioUnitario: number;
}

/** Se creó un pedido por checkout directo (contraentrega / transferencia). */
export class PedidoCreado implements DomainEvent {
  static readonly NAME = 'orders.pedido-creado';
  readonly name = PedidoCreado.NAME;

  constructor(
    readonly pedido: {
      orderId: string;
      orderNumber: string;
      total: number;
      metodoPago: MetodoPago;
      lineas: LineaPedido[];
      cliente: ClientePedido;
      fbp: string | null;
      fbc: string | null;
    },
  ) {}
}

/**
 * Un pedido pasó a CONFIRMADO (a mano o por pago aprobado). Se publica dentro
 * de la transacción: inventario descuenta stock y ventas registra la venta,
 * y si cualquiera falla (p. ej. stock insuficiente) la confirmación entera se
 * revierte.
 */
export class PedidoConfirmado implements DomainEvent {
  static readonly NAME = 'orders.pedido-confirmado';
  readonly name = PedidoConfirmado.NAME;

  constructor(
    readonly pedido: {
      orderId: string;
      orderNumber: string;
      cliente: string;
      celular: string | null;
      lineas: LineaInventariable[];
    },
  ) {}
}

/** Se canceló un pedido que ya había sido confirmado: hay que deshacer sus efectos. */
export class ConfirmacionDePedidoRevertida implements DomainEvent {
  static readonly NAME = 'orders.confirmacion-revertida';
  readonly name = ConfirmacionDePedidoRevertida.NAME;

  constructor(
    readonly pedido: {
      orderId: string;
      orderNumber: string;
      lineas: LineaInventariable[];
    },
  ) {}
}

export class EstadoDePedidoCambiado implements DomainEvent {
  static readonly NAME = 'orders.estado-cambiado';
  readonly name = EstadoDePedidoCambiado.NAME;

  constructor(
    readonly cambio: {
      orderId: string;
      orderNumber: string;
      estadoAnterior: EstadoPedido;
      estadoNuevo: EstadoPedido;
      emailCliente: string | null;
      nombreCliente: string;
      /**
       * false solo en la confirmación automática por MercadoPago: ahí el
       * cliente y el admin ya reciben el comprobante de pago.
       */
      notificar: boolean;
    },
  ) {}
}
