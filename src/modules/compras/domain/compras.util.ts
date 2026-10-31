export function costoTotalCompra(
  cantidad: number,
  costoUnitario: number,
): number {
  return cantidad * costoUnitario;
}

export interface CompraExistente {
  fecha: Date;
  marca: string | null;
  modelo: string;
  cantidad: number;
  costoUnitario: number;
  categoria: string;
}

export interface CompraUpdateDto {
  fecha?: string;
  marca?: string;
  modelo?: string;
  cantidad?: number;
  costoUnitario?: number;
  categoria?: string;
}

export interface CompraUpdatePlan {
  fecha: Date;
  marca: string | null;
  modelo: string;
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
  categoria: string;
  /** El modelo cambió — hay que mover el stock de un InventarioMaestro a otro. */
  modeloCambio: boolean;
  /** Cambió marca y/o modelo — hay que renombrar (o crear) el Product asociado. */
  identidadCambio: boolean;
  /** Si hay que tocar PrecioProducto: cambió el costo, o cambió a qué modelo pertenece. */
  actualizarPrecio: boolean;
}

// Toda la decisión de "qué cambió y qué hay que tocar" en un solo lugar, pura
// y testeable sin Prisma — la transacción en el repositorio solo ejecuta lo
// que este plan ya decidió, sin volver a interpretar el dto.
export function planCompraUpdate(
  existing: CompraExistente,
  dto: CompraUpdateDto,
): CompraUpdatePlan {
  const marca = dto.marca ?? existing.marca;
  const modelo = dto.modelo ?? existing.modelo;
  const cantidad = dto.cantidad ?? existing.cantidad;
  const costoUnitario = dto.costoUnitario ?? existing.costoUnitario;
  const categoria = dto.categoria ?? existing.categoria;
  const modeloCambio = Boolean(dto.modelo && dto.modelo !== existing.modelo);
  const identidadCambio =
    modeloCambio || (dto.marca !== undefined && dto.marca !== existing.marca);

  return {
    fecha: dto.fecha ? new Date(dto.fecha) : existing.fecha,
    marca,
    modelo,
    cantidad,
    costoUnitario,
    costoTotal: costoTotalCompra(cantidad, costoUnitario),
    categoria,
    modeloCambio,
    identidadCambio,
    actualizarPrecio: dto.costoUnitario !== undefined || identidadCambio,
  };
}
