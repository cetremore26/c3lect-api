import type {
  CompraExistente,
  CompraUpdatePlan,
} from '../../domain/compras.util';

export const COMPRAS_REPOSITORY = Symbol('COMPRAS_REPOSITORY');

export interface Compra extends CompraExistente {
  id: string;
  costoTotal: number;
  createdAt: Date;
}

export interface NewCompraData {
  fecha: Date;
  marca: string;
  modelo: string;
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
  categoria: string;
}

// Único dueño de la tabla purchases. Stock, precios y catálogo reaccionan a
// CompraRegistrada / CompraCorregida en sus propios módulos.
export interface ComprasRepositoryPort {
  findById(id: string): Promise<Compra | null>;
  create(data: NewCompraData): Promise<Compra>;
  update(id: string, plan: CompraUpdatePlan): Promise<Compra>;
  findAllParaInventario(): Promise<
    Pick<
      Compra,
      'marca' | 'modelo' | 'cantidad' | 'costoUnitario' | 'categoria'
    >[]
  >;
  findMarcas(): Promise<string[]>;
}
