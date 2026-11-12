import { EstadoPago } from './payment-status';

const MP_STATUS_MAP: Record<string, EstadoPago> = {
  approved: EstadoPago.APROBADO,
  rejected: EstadoPago.RECHAZADO,
  pending: EstadoPago.PENDIENTE,
  in_process: EstadoPago.PENDIENTE,
  cancelled: EstadoPago.CANCELADO,
  refunded: EstadoPago.REEMBOLSADO,
  charged_back: EstadoPago.REEMBOLSADO,
};

export function mapEstadoPago(mpStatus: string | undefined): EstadoPago {
  return MP_STATUS_MAP[mpStatus ?? ''] ?? EstadoPago.PENDIENTE;
}
