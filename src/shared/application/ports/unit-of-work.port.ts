export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

export interface UnitOfWorkOptions {
  /** Milisegundos antes de abortar la transacción. */
  timeout?: number;
}

/**
 * Agrupa varias operaciones (de este módulo y de los handlers
 * `in-transaction` que reaccionan a sus eventos) en una sola transacción.
 * Los repositorios no reciben la transacción por parámetro: la toman del
 * contexto, así que un caso de uso puede coordinar varios repositorios sin
 * saber nada de Prisma. Las llamadas anidadas se unen a la transacción en
 * curso.
 */
export interface UnitOfWorkPort {
  run<T>(work: () => Promise<T>, options?: UnitOfWorkOptions): Promise<T>;
}
