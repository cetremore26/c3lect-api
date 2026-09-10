export function calcularCostoTotal(
  costoUnitario: number,
  costoAdicional: number,
): number {
  return costoUnitario + costoAdicional;
}

export function calcularGananciaMinima(
  precioCierre: number | null,
  costoTotal: number,
): number | null {
  return precioCierre != null ? precioCierre - costoTotal : null;
}
