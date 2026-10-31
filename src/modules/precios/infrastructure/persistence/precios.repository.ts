import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import {
  PrecioProducto,
  PrecioProductoData,
  PreciosRepositoryPort,
} from '../../application/ports/precios-repository.port';

@Injectable()
export class PreciosRepository implements PreciosRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  findAll(): Promise<PrecioProducto[]> {
    return this.db.client.precioProducto.findMany({
      orderBy: { modelo: 'asc' },
    });
  }

  findById(id: string): Promise<PrecioProducto | null> {
    return this.db.client.precioProducto.findUnique({ where: { id } });
  }

  findByModelo(modelo: string): Promise<PrecioProducto | null> {
    return this.db.client.precioProducto.findUnique({ where: { modelo } });
  }

  create(data: PrecioProductoData): Promise<PrecioProducto> {
    return this.db.client.precioProducto.create({ data });
  }

  update(
    id: string,
    data: Partial<PrecioProductoData>,
  ): Promise<PrecioProducto> {
    return this.db.client.precioProducto.update({ where: { id }, data });
  }

  async upsertPorModelo(
    modelo: string,
    update: Partial<PrecioProductoData>,
    create: PrecioProductoData,
  ): Promise<void> {
    await this.db.client.precioProducto.upsert({
      where: { modelo },
      update,
      create,
    });
  }

  async borrarHuerfanosSinPrecioManual(
    modelosActivos: string[],
  ): Promise<void> {
    await this.db.client.precioProducto.deleteMany({
      where: {
        modelo: { notIn: modelosActivos },
        precioPublico: null,
        precioCierre: null,
      },
    });
  }
}
