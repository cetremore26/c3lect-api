import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import type {
  UnitOfWorkOptions,
  UnitOfWorkPort,
} from '../../application/ports/unit-of-work.port';
import { PrismaService } from './prisma.service';

export type DbClient = Prisma.TransactionClient;

interface TxContext {
  tx: DbClient;
  afterCommit: (() => void)[];
}

// Transacción ambiental: la transacción interactiva de Prisma se guarda en
// AsyncLocalStorage y todo repositorio que lea `client` durante ese flujo
// async la usa sin recibirla por parámetro. Es la pieza que permite que un
// caso de uso de orders y los handlers de inventario/ventas que reaccionan a
// su evento escriban en sus propias tablas dentro de UNA transacción, sin
// importarse entre sí.
@Injectable()
export class PrismaTransactionHost implements UnitOfWorkPort {
  private readonly als = new AsyncLocalStorage<TxContext>();

  constructor(private readonly prisma: PrismaService) {}

  /** Transacción en curso si la hay; si no, el cliente normal. */
  get client(): DbClient {
    return this.als.getStore()?.tx ?? this.prisma;
  }

  async run<T>(
    work: () => Promise<T>,
    options?: UnitOfWorkOptions,
  ): Promise<T> {
    if (this.als.getStore()) return work();

    const afterCommit: (() => void)[] = [];
    const result = await this.prisma.$transaction(
      (tx) => this.als.run({ tx, afterCommit }, work),
      options,
    );
    for (const fn of afterCommit) fn();
    return result;
  }

  /** Corre `fn` cuando la transacción en curso confirme (o ya, si no hay). */
  afterCommit(fn: () => void): void {
    const ctx = this.als.getStore();
    if (ctx) ctx.afterCommit.push(fn);
    else fn();
  }
}
