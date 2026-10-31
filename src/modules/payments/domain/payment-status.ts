// Mismos valores que el enum EstadoPago de schema.prisma; el dominio no
// importa @prisma/client para conocerlos.
export const EstadoPago = {
  PENDIENTE: 'PENDIENTE',
  APROBADO: 'APROBADO',
  RECHAZADO: 'RECHAZADO',
  CANCELADO: 'CANCELADO',
} as const;
export type EstadoPago = (typeof EstadoPago)[keyof typeof EstadoPago];
