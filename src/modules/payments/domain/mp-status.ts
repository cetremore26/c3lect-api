import { EstadoPago } from '@prisma/client';

const MP_STATUS_MAP: Record<string, EstadoPago> = {
  approved: EstadoPago.APROBADO,
  rejected: EstadoPago.RECHAZADO,
  pending: EstadoPago.PENDIENTE,
  in_process: EstadoPago.PENDIENTE,
  cancelled: EstadoPago.CANCELADO,
};

export function mapEstadoPago(mpStatus: string | undefined): EstadoPago {
  return MP_STATUS_MAP[mpStatus ?? ''] ?? EstadoPago.PENDIENTE;
}
