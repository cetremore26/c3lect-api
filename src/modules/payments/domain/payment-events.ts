import type { DomainEvent } from '../../../shared/domain/domain-event';

export interface ClientePago {
  email: string;
  nombreCompleto: string;
  telefono: string;
  ciudad: string;
  departamento: string;
}

/**
 * MercadoPago aprobó el pago y el pedido quedó confirmado. Notificaciones
 * envía el comprobante al cliente y al admin; meta-conversions reporta el
 * Purchase (event_id = orderNumber, el mismo external_reference que vio
 * MercadoPago, para que Meta deduplique contra el evento del navegador).
 */
export class PagoAprobado implements DomainEvent {
  static readonly NAME = 'payments.pago-aprobado';
  readonly name = PagoAprobado.NAME;

  constructor(
    readonly pago: {
      orderNumber: string;
      total: number;
      lineas: {
        productId: string;
        nombre: string;
        cantidad: number;
        precioUnitario: number;
        subtotal: number;
      }[];
      cliente: ClientePago | null;
      fbp: string | null;
      fbc: string | null;
      comprobantePdf: Buffer;
    },
  ) {}
}

/**
 * El dinero ya lo cobró MercadoPago pero el pedido no se pudo crear o
 * confirmar (típicamente: no había stock). Un admin debe resolverlo a mano:
 * reabastecer y crear el pedido, o reembolsar.
 */
export class PagoSinPedido implements DomainEvent {
  static readonly NAME = 'payments.pago-sin-pedido';
  readonly name = PagoSinPedido.NAME;

  constructor(readonly incidente: { orderNumber: string; detalle: string }) {}
}
