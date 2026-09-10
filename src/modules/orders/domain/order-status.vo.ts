import { BadRequestException } from '@nestjs/common';
import { EstadoPedido } from '@prisma/client';

// Regla de dominio pura: qué transiciones de estado son válidas. Vive junto al
// resto del módulo (no en una capa "domain" 100% framework-agnostic) porque
// BadRequestException es la forma en que el resto de este backend expresa
// errores de negocio — separar eso solo agregaría una traducción de excepciones
// sin ningún beneficio real en este proyecto.
const VALID_TRANSITIONS: Record<EstadoPedido, EstadoPedido[]> = {
  PENDIENTE: [EstadoPedido.CONFIRMADO, EstadoPedido.CANCELADO],
  CONFIRMADO: [EstadoPedido.EN_CAMINO, EstadoPedido.CANCELADO],
  EN_CAMINO: [EstadoPedido.ENTREGADO, EstadoPedido.CANCELADO],
  ENTREGADO: [],
  CANCELADO: [],
};

export class OrderStatusTransition {
  static assertValid(desde: EstadoPedido, hacia: EstadoPedido): void {
    if (!VALID_TRANSITIONS[desde].includes(hacia)) {
      throw new BadRequestException(
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
