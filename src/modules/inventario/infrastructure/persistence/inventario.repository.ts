import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import {
  IngresoData,
  InventarioItem,
  InventarioRepositoryPort,
  SeedRow,
} from '../../application/ports/inventario-repository.port';

// Único dueño de la tabla inventario_maestro.
@Injectable()
export class InventarioRepository implements InventarioRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  findAll(): Promise<InventarioItem[]> {
    return this.db.client.inventarioMaestro.findMany({
      orderBy: [{ stock: 'desc' }, { modelo: 'asc' }],
    });
  }

  findStockPublico() {
    return this.db.client.inventarioMaestro.findMany({
      select: { modelo: true, stock: true },
    });
  }

  findByModelo(modelo: string): Promise<InventarioItem | null> {
    return this.db.client.inventarioMaestro.findUnique({ where: { modelo } });
  }

  async buscarPorModelo(
    modelo: string,
    nombreCompletoLegado: string,
  ): Promise<InventarioItem | null> {
    const item = await this.findInsensitive(modelo);
    if (item) return item;
    if (modelo !== nombreCompletoLegado) {
      return this.findInsensitive(nombreCompletoLegado);
    }
    return null;
  }

  async descontar(id: string, cantidad: number): Promise<number | null> {
    // Postgres bloquea la fila y re-evalúa el WHERE al ejecutar el UPDATE.
    const { count } = await this.db.client.inventarioMaestro.updateMany({
      where: { id, stock: { gte: cantidad } },
      data: { stock: { decrement: cantidad } },
    });
    if (count === 0) return null;
    return this.stockDe(id);
  }

  async incrementar(id: string, cantidad: number): Promise<number> {
    const { stock } = await this.db.client.inventarioMaestro.update({
      where: { id },
      data: { stock: { increment: cantidad } },
      select: { stock: true },
    });
    return stock;
  }

  async ajustarStockPorModelo(modelo: string, delta: number): Promise<void> {
    await this.db.client.inventarioMaestro.updateMany({
      where: { modelo },
      data: { stock: { increment: delta } },
    });
  }

  async registrarIngreso(data: IngresoData): Promise<void> {
    await this.db.client.inventarioMaestro.upsert({
      where: { modelo: data.modelo },
      update: {
        marca: data.marca,
        stock: { increment: data.cantidad },
        costoUnitario: data.costoUnitario,
        categoria: data.categoria,
      },
      create: {
        marca: data.marca,
        modelo: data.modelo,
        stock: data.cantidad,
        costoUnitario: data.costoUnitario,
        categoria: data.categoria,
      },
    });
  }

  async corregirPorModelo(
    modelo: string,
    data: {
      marca: string | null;
      deltaStock: number;
      costoUnitario: number;
      categoria: string;
    },
  ): Promise<void> {
    await this.db.client.inventarioMaestro.updateMany({
      where: { modelo },
      data: {
        marca: data.marca,
        ...(data.deltaStock !== 0
          ? { stock: { increment: data.deltaStock } }
          : {}),
        costoUnitario: data.costoUnitario,
        categoria: data.categoria,
      },
    });
  }

  async applySeed(modelosActivos: string[], filas: SeedRow[]): Promise<number> {
    const client = this.db.client;
    await client.inventarioMaestro.deleteMany({
      where: { modelo: { notIn: modelosActivos } },
    });

    for (const fila of filas) {
      await client.inventarioMaestro.upsert({
        where: { modelo: fila.modelo },
        update: {
          marca: fila.marca,
          stock: fila.stock,
          costoUnitario: fila.costoUnitario,
          categoria: fila.categoria,
        },
        create: {
          marca: fila.marca,
          modelo: fila.modelo,
          stock: fila.stock,
          costoUnitario: fila.costoUnitario,
          categoria: fila.categoria,
        },
      });
    }
    return filas.length;
  }

  private async stockDe(id: string): Promise<number> {
    const { stock } = await this.db.client.inventarioMaestro.findUniqueOrThrow({
      where: { id },
      select: { stock: true },
    });
    return stock;
  }

  private findInsensitive(modelo: string): Promise<InventarioItem | null> {
    return this.db.client.inventarioMaestro.findFirst({
      where: { modelo: { equals: modelo, mode: 'insensitive' } },
    });
  }
}
