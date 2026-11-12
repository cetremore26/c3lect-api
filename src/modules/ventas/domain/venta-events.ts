import type { DomainEvent } from '../../../shared/domain/domain-event';

// Hechos que publica ventas sobre las ventas registradas a mano en el panel
// (las de la plataforma nacen de SalidaPorPedidoRegistrada y no se publican
// de nuevo: su stock ya lo descontó el pedido).

export class VentaManualRegistrada implements DomainEvent {
  static readonly NAME = 'ventas.venta-manual-registrada';
  readonly name = VentaManualRegistrada.NAME;

  constructor(
    readonly venta: {
      ventaId: string;
      marca: string | null;
      modelo: string;
      cliente: string;
      celular: string | null;
      precioVenta: number;
      fecha: Date;
      /** Canal digital + celular + venta real: se reporta a Meta como compra offline. */
      elegibleMetaOffline: boolean;
    },
  ) {}
}

export class VentaEliminada implements DomainEvent {
  static readonly NAME = 'ventas.venta-eliminada';
  readonly name = VentaEliminada.NAME;

  constructor(
    readonly venta: { ventaId: string; marca: string | null; modelo: string },
  ) {}
}

/**
 * Se anularon las ventas de plataforma de un pedido (cancelación de un
 * CONFIRMADO). `lineas` es lo que realmente se despachó (las filas que ventas
 * tenía registradas), no lo que dice el catálogo hoy: inventario repone
 * exactamente eso.
 */
export class VentasDePedidoAnuladas implements DomainEvent {
  static readonly NAME = 'ventas.ventas-de-pedido-anuladas';
  readonly name = VentasDePedidoAnuladas.NAME;

  constructor(
    readonly anulacion: {
      orderId: string;
      lineas: { marca: string | null; modelo: string; cantidad: number }[];
    },
  ) {}
}
