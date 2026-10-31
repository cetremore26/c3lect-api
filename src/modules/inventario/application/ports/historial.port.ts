export const HISTORIAL_COMPRAS = Symbol('HISTORIAL_COMPRAS');
export const HISTORIAL_VENTAS = Symbol('HISTORIAL_VENTAS');

export interface CompraHistorica {
  marca: string | null;
  modelo: string;
  cantidad: number;
  costoUnitario: number;
  categoria: string;
}

// El recálculo de inventario parte de las compras y ventas históricas, que
// son de los contextos compras y ventas: se leen por estos puertos.
export interface HistorialComprasPort {
  listar(): Promise<CompraHistorica[]>;
}

export interface HistorialVentasPort {
  /** Una entrada por cada venta registrada. */
  modelosVendidos(): Promise<{ modelo: string }[]>;
}
