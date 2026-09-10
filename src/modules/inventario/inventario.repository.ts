import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface SeedRow {
  modelo: string;
  marca: string | null;
  stock: number;
  costoUnitario: number;
  categoria: string;
  costoTotal: number;
  costoAdicional: number;
}

@Injectable()
export class InventarioRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.inventarioMaestro.findMany({
      orderBy: [{ stock: 'desc' }, { modelo: 'asc' }],
    });
  }

  findStockPublico() {
    return this.prisma.inventarioMaestro.findMany({
      select: { modelo: true, stock: true },
    });
  }

  findComprasParaSeed() {
    return this.prisma.purchase.findMany({
      select: {
        marca: true,
        modelo: true,
        cantidad: true,
        costoUnitario: true,
        categoria: true,
      },
    });
  }

  findVentasParaSeed() {
    return this.prisma.historicalSale.findMany({ select: { modelo: true } });
  }

  // Única transacción atómica: borra las entradas huérfanas (modelos que ya
  // no aparecen en ninguna compra) de ambas tablas y hace upsert de cada
  // fila recalculada. No se puede partir en llamadas separadas sin arriesgar
  // dejar InventarioMaestro y PrecioProducto desincronizados a mitad de
  // camino — igual criterio que PrismaOrderRepository.transitionStatus.
  async applySeed(modelosActivos: string[], filas: SeedRow[]): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.inventarioMaestro.deleteMany({
          where: { modelo: { notIn: modelosActivos } },
        });
        // En precios: solo eliminar entradas sin precios manuales (auto-creadas desde compras)
        await tx.precioProducto.deleteMany({
          where: {
            modelo: { notIn: modelosActivos },
            precioPublico: null,
            precioCierre: null,
          },
        });

        let count = 0;
        for (const fila of filas) {
          await tx.inventarioMaestro.upsert({
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
          await tx.precioProducto.upsert({
            where: { modelo: fila.modelo },
            update: {
              marca: fila.marca,
              costoUnitario: fila.costoUnitario,
              costoTotal: fila.costoTotal,
            },
            create: {
              marca: fila.marca,
              modelo: fila.modelo,
              costoUnitario: fila.costoUnitario,
              costoAdicional: fila.costoAdicional,
              costoTotal: fila.costoTotal,
            },
          });
          count++;
        }
        return count;
      },
      { timeout: 15000 },
    );
  }
}
