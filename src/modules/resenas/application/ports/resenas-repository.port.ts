import type { EstadoResena } from '../../domain/resena';

export const RESENAS_REPOSITORY = Symbol('RESENAS_REPOSITORY');

export interface Resena {
  id: string;
  productId: string;
  productoNombre: string;
  userId: string;
  autorNombre: string;
  calificacion: number;
  titulo: string | null;
  comentario: string;
  estado: EstadoResena;
  respuesta: string | null;
  respondidaAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NuevaResena = Pick<
  Resena,
  | 'productId'
  | 'productoNombre'
  | 'userId'
  | 'autorNombre'
  | 'calificacion'
  | 'titulo'
  | 'comentario'
>;

export type CambiosResena = Partial<
  Pick<Resena, 'estado' | 'respuesta' | 'respondidaAt'>
>;

export interface FiltroResenas {
  estado?: EstadoResena;
}

export interface ResenasRepositoryPort {
  findMany(
    filtro: FiltroResenas,
    skip: number,
    take: number,
  ): Promise<{ data: Resena[]; total: number }>;
  findById(id: string): Promise<Resena | null>;
  /** Ids de los productos que el usuario ya reseñó. */
  productosResenados(userId: string): Promise<string[]>;
  create(data: NuevaResena): Promise<Resena>;
  update(id: string, data: CambiosResena): Promise<Resena>;
}
