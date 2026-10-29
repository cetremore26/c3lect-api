import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import { PromotionsRepositoryPort } from '../../application/ports/promotions-repository.port';
import type { Promotion, PromotionData } from '../../domain/promotion';

@Injectable()
export class PromotionsRepository implements PromotionsRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  findAll(): Promise<Promotion[]> {
    return this.db.client.promotion.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findVigentes(ahora: Date): Promise<Promotion[]> {
    return this.db.client.promotion.findMany({
      where: {
        activo: true,
        fechaInicio: { lte: ahora },
        fechaFin: { gte: ahora },
      },
    });
  }

  findById(id: string): Promise<Promotion | null> {
    return this.db.client.promotion.findUnique({ where: { id } });
  }

  create(data: PromotionData): Promise<Promotion> {
    return this.db.client.promotion.create({
      data: {
        nombre: data.nombre,
        alcance: data.alcance,
        porcentaje: data.porcentaje,
        productosIncluidos: data.productosIncluidos ?? [],
        categoria: data.categoria,
        marca: data.marca,
        excluidos: data.excluidos ?? [],
        soloCuentaActiva: data.soloCuentaActiva ?? false,
        fechaInicio: new Date(data.fechaInicio),
        fechaFin: new Date(data.fechaFin),
        activo: data.activo ?? true,
      },
    });
  }

  update(id: string, data: Partial<PromotionData>): Promise<Promotion> {
    return this.db.client.promotion.update({
      where: { id },
      data: {
        ...data,
        fechaInicio: data.fechaInicio ? new Date(data.fechaInicio) : undefined,
        fechaFin: data.fechaFin ? new Date(data.fechaFin) : undefined,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.db.client.promotion.delete({ where: { id } });
  }
}
