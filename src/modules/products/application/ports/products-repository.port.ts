import type {
  Product,
  ProductData,
  ProductFilter,
  ProductSort,
} from '../../domain/product';

export const PRODUCTS_REPOSITORY = Symbol('PRODUCTS_REPOSITORY');

export interface StubData {
  id: string;
  nombre: string;
  cat: string;
  marca: string | null;
}

// Único dueño de la tabla productos.
export interface ProductsRepositoryPort {
  findAll(filter: ProductFilter, sort: ProductSort): Promise<Product[]>;
  findAllPaginated(
    filter: ProductFilter,
    sort: ProductSort,
    skip: number,
    take: number,
  ): Promise<{ data: Product[]; total: number }>;
  findById(id: string): Promise<Product | null>;
  findByIds(ids: string[], soloDisponibles: boolean): Promise<Product[]>;
  create(data: ProductData): Promise<Product>;
  update(id: string, data: Partial<Omit<ProductData, 'id'>>): Promise<Product>;
  remove(id: string): Promise<void>;
  findMarcas(): Promise<string[]>;

  // --- Variantes por nombre ("Marca Modelo", sin distinguir mayúsculas) ---
  /** Cambia disponibilidad solo de las variantes que no la tienen ya. */
  setDisponibilidadPorNombre(
    nombre: string,
    disponible: boolean,
  ): Promise<void>;
  setPrecioPorNombre(nombre: string, precio: number): Promise<void>;
  /** Renombra variantes; devuelve cuántas cambió. */
  renombrar(
    nombreAnterior: string,
    nombreNuevo: string,
    marca: string | null,
  ): Promise<number>;
  /**
   * Variantes de un (marca, modelo): primero por "Marca Modelo"; si no hay
   * marca o no aparece nada, por el modelo a secas (filas legadas sin marca).
   */
  findByMarcaModelo(marca: string | null, modelo: string): Promise<Product[]>;
  existsId(id: string): Promise<boolean>;
  createStub(data: StubData): Promise<void>;
  enable(ids: string[]): Promise<void>;
  setMarca(ids: string[], marca: string): Promise<void>;
}
