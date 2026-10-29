export function calcularTotalGastado(orders: { total: number }[]): number {
  return orders.reduce((sum, o) => sum + o.total, 0);
}
