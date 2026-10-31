import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import {
  Gasto,
  GastosRepositoryPort,
  NewGastoData,
} from '../../application/ports/gastos-repository.port';

@Injectable()
export class GastosRepository implements GastosRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  findAll(): Promise<Gasto[]> {
    return this.db.client.expense.findMany({ orderBy: { fecha: 'desc' } });
  }

  findById(id: string): Promise<Gasto | null> {
    return this.db.client.expense.findUnique({ where: { id } });
  }

  create(data: NewGastoData): Promise<Gasto> {
    return this.db.client.expense.create({ data });
  }

  update(id: string, data: Partial<NewGastoData>): Promise<Gasto> {
    return this.db.client.expense.update({ where: { id }, data });
  }

  async remove(id: string): Promise<void> {
    await this.db.client.expense.delete({ where: { id } });
  }
}
