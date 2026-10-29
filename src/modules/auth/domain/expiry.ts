// "7d" / "12h" / "30m" / "45s" → fecha de vencimiento a partir de `desde`.
// Cualquier formato no reconocido cae a 7 días.
export function parseExpiry(expiry: string, desde = new Date()): Date {
  const fecha = new Date(desde);
  const unit = expiry.slice(-1);
  const value = parseInt(expiry.slice(0, -1), 10);
  switch (unit) {
    case 'd':
      fecha.setDate(fecha.getDate() + value);
      break;
    case 'h':
      fecha.setHours(fecha.getHours() + value);
      break;
    case 'm':
      fecha.setMinutes(fecha.getMinutes() + value);
      break;
    case 's':
      fecha.setSeconds(fecha.getSeconds() + value);
      break;
    default:
      fecha.setDate(fecha.getDate() + 7);
  }
  return fecha;
}
