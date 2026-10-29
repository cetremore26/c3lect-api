import { BusinessRuleViolation } from '../../../shared/domain/domain-error';

// Vocabulario propio del dominio. Los valores coinciden 1:1 con los enums de
// Prisma (EstadoPedido / MetodoPago en schema.prisma), así que la capa de
// persistencia los acepta sin traducir — pero el dominio ya no importa
// @prisma/client para saber qué estados existen.
export const EstadoPedido = {
  PENDIENTE: 'PENDIENTE',
  CONFIRMADO: 'CONFIRMADO',
  EN_CAMINO: 'EN_CAMINO',
  ENTREGADO: 'ENTREGADO',
  CANCELADO: 'CANCELADO',
} as const;
export type EstadoPedido = (typeof EstadoPedido)[keyof typeof EstadoPedido];

export const MetodoPago = {
  TRANSFERENCIA: 'TRANSFERENCIA',
  CONTRAENTREGA: 'CONTRAENTREGA',
  TARJETA_CREDITO: 'TARJETA_CREDITO',
  TARJETA_DEBITO: 'TARJETA_DEBITO',
  NEQUI: 'NEQUI',
  DAVIPLATA: 'DAVIPLATA',
  MERCADOPAGO: 'MERCADOPAGO',
} as const;
export type MetodoPago = (typeof MetodoPago)[keyof typeof MetodoPago];

// Regla de dominio pura: qué transiciones de estado son válidas.
const VALID_TRANSITIONS: Record<EstadoPedido, EstadoPedido[]> = {
  PENDIENTE: [EstadoPedido.CONFIRMADO, EstadoPedido.CANCELADO],
  CONFIRMADO: [EstadoPedido.EN_CAMINO, EstadoPedido.CANCELADO],
  EN_CAMINO: [EstadoPedido.ENTREGADO, EstadoPedido.CANCELADO],
  ENTREGADO: [],
  CANCELADO: [],
};

export class OrderStatusTransition {
  /** Estados a los que se puede pasar desde `desde` (para ofrecerlos en la UI). */
  static permitidasDesde(desde: EstadoPedido): EstadoPedido[] {
    return [...VALID_TRANSITIONS[desde]];
  }

  static assertValid(desde: EstadoPedido, hacia: EstadoPedido): void {
    if (!VALID_TRANSITIONS[desde].includes(hacia)) {
      throw new BusinessRuleViolation(
        `No se puede cambiar de ${desde} a ${hacia}.`,
      );
    }
  }

  // El stock y las ventas solo se generan al confirmar (PENDIENTE→CONFIRMADO)
  // y solo se revierten si se cancela un pedido que ya los había generado
  // (es decir, que pasó por CONFIRMADO). Cancelar desde PENDIENTE nunca tocó
  // ni stock ni ventas.
  static seConfirma(desde: EstadoPedido, hacia: EstadoPedido): boolean {
    return (
      desde === EstadoPedido.PENDIENTE && hacia === EstadoPedido.CONFIRMADO
    );
  }

  static seCancelaConStockDescontado(
    desde: EstadoPedido,
    hacia: EstadoPedido,
  ): boolean {
    return hacia === EstadoPedido.CANCELADO && desde !== EstadoPedido.PENDIENTE;
  }
}
