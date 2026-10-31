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
