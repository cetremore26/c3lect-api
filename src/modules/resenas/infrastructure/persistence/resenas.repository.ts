import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import type {
  CambiosResena,
  FiltroResenas,
  NuevaResena,
  Resena,
  ResenasRepositoryPort,
} from '../../application/ports/resenas-repository.port';

@Injectable()
export class ResenasRepository implements ResenasRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  async findMany(
    filtro: FiltroResenas,
    skip: number,
    take: number,
  ): Promise<{ data: Resena[]; total: number }> {
    const where = filtro.estado ? { estado: filtro.estado } : {};
    const [data, total] = await Promise.all([
      this.db.client.resena.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.db.client.resena.count({ where }),
    ]);
    return { data, total };
  }

  findById(id: string): Promise<Resena | null> {
    return this.db.client.resena.findUnique({ where: { id } });
  }

  async productosResenados(userId: string): Promise<string[]> {
    const rows = await this.db.client.resena.findMany({
      where: { userId },
      select: { productId: true },
    });
    return rows.map((r) => r.productId);
  }

  create(data: NuevaResena): Promise<Resena> {
    return this.db.client.resena.create({ data });
  }

  update(id: string, data: CambiosResena): Promise<Resena> {
    return this.db.client.resena.update({ where: { id }, data });
  }
}
