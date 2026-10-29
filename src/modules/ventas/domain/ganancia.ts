// Ganancia neta de una venta, proporcional a lo abonado: una venta a medio
// pagar solo reconoce la parte cobrada del margen. Es regla del contexto
// ventas; métricas la reutiliza vía public-api para sus agregados.
export function calcGananciaPorVenta(
  _estado: string,
  precioVenta: number,
  costoProducto: number,
  costoEnvio: number,
  abono: number,
): number {
  if (precioVenta === 0) return -costoProducto - costoEnvio;
  const margen = precioVenta - costoProducto - costoEnvio;
  return (Math.min(abono, precioVenta) / precioVenta) * margen;
}
