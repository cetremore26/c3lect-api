import type { UnitOfWorkPort } from '../application/ports/unit-of-work.port';
import type { DomainEvent } from '../domain/domain-event';

// Dobles en memoria de los puertos transversales, para specs de casos de uso.

/** Unidad de trabajo que solo ejecuta el trabajo (sin transacción real). */
export function fakeUnitOfWork() {
  const run = jest.fn((work: () => Promise<unknown>) => work());
  return { run } as { run: typeof run } & UnitOfWorkPort;
}

/** Bus que guarda lo publicado para poder afirmar sobre los eventos. */
export function fakeEventBus() {
  const published: DomainEvent[] = [];
  return {
    published,
    publish: jest.fn((...events: DomainEvent[]) => {
      published.push(...events);
      return Promise.resolve();
    }),
    subscribe: jest.fn(),
    /** Eventos publicados de un tipo, ya tipados. */
    of<E extends DomainEvent>(type: { NAME: string; prototype: E }): E[] {
      return published.filter((e) => e.name === type.NAME) as E[];
    },
  };
}
