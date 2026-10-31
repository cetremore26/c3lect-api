export const PRECIOS_REPOSITORY = Symbol('PRECIOS_REPOSITORY');

export interface PrecioProducto {
  id: string;
  marca: string | null;
  modelo: string;
  costoUnitario: number;
  costoAdicional: number;
  costoTotal: number;
  precioPublico: number | null;
  precioCierre: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrecioProductoData {
  marca: string | null;
  modelo: string;
  costoUnitario: number;
  costoAdicional: number;
  costoTotal: number;
  precioPublico?: number | null;
  precioCierre?: number | null;
}

// Único dueño de la tabla calculo_precios.
export interface PreciosRepositoryPort {
  findAll(): Promise<PrecioProducto[]>;
  findById(id: string): Promise<PrecioProducto | null>;
  findByModelo(modelo: string): Promise<PrecioProducto | null>;
  create(data: PrecioProductoData): Promise<PrecioProducto>;
  update(
    id: string,
    data: Partial<PrecioProductoData>,
  ): Promise<PrecioProducto>;
  /** Upsert por modelo: `update` aplica si existe, `create` si no. */
  upsertPorModelo(
    modelo: string,
    update: Partial<PrecioProductoData>,
    create: PrecioProductoData,
  ): Promise<void>;
  /** Borra los modelos fuera de la lista que no tengan precios manuales. */
  borrarHuerfanosSinPrecioManual(modelosActivos: string[]): Promise<void>;
}
