export const GASTOS_REPOSITORY = Symbol('GASTOS_REPOSITORY');

export interface Gasto {
  id: string;
  fecha: Date;
  concepto: string;
  monto: number;
  responsable: string | null;
  estado: string | null;
  createdAt: Date;
}

export type NewGastoData = Omit<Gasto, 'id' | 'createdAt'>;

export interface GastosRepositoryPort {
  findAll(): Promise<Gasto[]>;
  findById(id: string): Promise<Gasto | null>;
  create(data: NewGastoData): Promise<Gasto>;
  update(id: string, data: Partial<NewGastoData>): Promise<Gasto>;
  remove(id: string): Promise<void>;
}
