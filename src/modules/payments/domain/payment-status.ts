// Mismos valores que el enum EstadoPago de schema.prisma; el dominio no
// importa @prisma/client para conocerlos.
export const EstadoPago = {
  PENDIENTE: 'PENDIENTE',
  APROBADO: 'APROBADO',
  RECHAZADO: 'RECHAZADO',
  CANCELADO: 'CANCELADO',
  REEMBOLSADO: 'REEMBOLSADO',
} as const;
export type EstadoPago = (typeof EstadoPago)[keyof typeof EstadoPago];

// Solo APROBADO y REEMBOLSADO son definitivos. RECHAZADO y CANCELADO no lo
// son: el cliente puede reintentar y pagar el mismo pedido despues.
export const ESTADOS_TERMINALES: readonly EstadoPago[] = [
  EstadoPago.APROBADO,
  EstadoPago.REEMBOLSADO,
];

export interface ReglaDeTransicion {
  desde: readonly EstadoPago[];
  exigeMismoMpPaymentId: boolean;
}

export function reglaDeTransicion(nuevo: EstadoPago): ReglaDeTransicion {
  if (nuevo === EstadoPago.REEMBOLSADO) {
    return { desde: [EstadoPago.APROBADO], exigeMismoMpPaymentId: true };
  }
  return {
    desde: [EstadoPago.PENDIENTE, EstadoPago.RECHAZADO, EstadoPago.CANCELADO],
    exigeMismoMpPaymentId: false,
  };
}
