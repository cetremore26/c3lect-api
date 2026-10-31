import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import {
  Compra,
  ComprasRepositoryPort,
  NewCompraData,
} from '../../application/ports/compras-repository.port';
import { CompraUpdatePlan } from '../../domain/compras.util';

@Injectable()
export class ComprasRepository implements ComprasRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  findById(id: string): Promise<Compra | null> {
    return this.db.client.purchase.findUnique({ where: { id } });
  }

  create(data: NewCompraData): Promise<Compra> {
    return this.db.client.purchase.create({ data });
  }

  update(id: string, plan: CompraUpdatePlan): Promise<Compra> {
    return this.db.client.purchase.update({
      where: { id },
      data: {
        fecha: plan.fecha,
        marca: plan.marca,
        modelo: plan.modelo,
        cantidad: plan.cantidad,
        costoUnitario: plan.costoUnitario,
        costoTotal: plan.costoTotal,
        categoria: plan.categoria,
      },
    });
  }

  findAllParaInventario() {
    return this.db.client.purchase.findMany({
      select: {
        marca: true,
        modelo: true,
        cantidad: true,
        costoUnitario: true,
        categoria: true,
      },
    });
  }

  async findMarcas(): Promise<string[]> {
    const rows = await this.db.client.purchase.findMany({
      where: { marca: { not: null } },
      select: { marca: true },
      distinct: ['marca'],
    });
    return rows.flatMap((r) => (r.marca ? [r.marca] : []));
  }
}
