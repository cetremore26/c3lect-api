// Costo de traer y alistar una unidad (envío, empaque) que se suma al costo
// del proveedor cuando nadie fijó otro. Única definición de este valor.
export const COSTO_ADICIONAL_DEFAULT = 25028;

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
