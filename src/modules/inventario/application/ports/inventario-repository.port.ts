export const INVENTARIO_REPOSITORY = Symbol('INVENTARIO_REPOSITORY');

export interface InventarioItem {
  id: string;
  marca: string | null;
  modelo: string;
  stock: number;
  costoUnitario: number;
  categoria: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SeedRow {
  modelo: string;
  marca: string | null;
  stock: number;
  costoUnitario: number;
  categoria: string;
}

export interface IngresoData {
  marca: string | null;
  modelo: string;
  cantidad: number;
  costoUnitario: number;
  categoria: string;
}

export interface InventarioRepositoryPort {
  findAll(): Promise<InventarioItem[]>;
  findStockPublico(): Promise<{ modelo: string; stock: number }[]>;

  /** Coincidencia exacta por modelo (la clave única de la tabla). */
  findByModelo(modelo: string): Promise<InventarioItem | null>;

  /**
   * Busca por modelo sin distinguir mayúsculas; si no aparece y el nombre
   * completo legado es distinto, reintenta con él. Ese fallback mantiene
   * vivo el checkout mientras haya filas sin marca/modelo separados.
   */
  buscarPorModelo(
    modelo: string,
    nombreCompletoLegado: string,
  ): Promise<InventarioItem | null>;

  /**
   * Decremento atómico: solo aplica si hay al menos `cantidad` en stock (la
   * condición se evalúa en el mismo UPDATE, así dos confirmaciones
   * concurrentes no pueden vender la misma última unidad). Devuelve el stock
   * resultante, o null si no alcanzaba.
   */
  descontar(id: string, cantidad: number): Promise<number | null>;

  /** Incremento atómico. Devuelve el stock resultante. */
  incrementar(id: string, cantidad: number): Promise<number>;

  /** Suma (o resta, con delta negativo) stock por modelo exacto; no-op si no existe. */
  ajustarStockPorModelo(modelo: string, delta: number): Promise<void>;

  /** Crea el modelo con `cantidad` de stock, o la suma si ya existía. */
  registrarIngreso(data: IngresoData): Promise<void>;

  /** Corrige datos de un modelo existente (sin crearlo). */
  corregirPorModelo(
    modelo: string,
    data: {
      marca: string | null;
      deltaStock: number;
      costoUnitario: number;
      categoria: string;
    },
  ): Promise<void>;

  /** Borra los modelos fuera de `modelosActivos` y hace upsert de `filas`. */
  applySeed(modelosActivos: string[], filas: SeedRow[]): Promise<number>;
}
