import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  combineMarcaModelo,
  findProductsByMarcaModelo,
} from '../../common/marca-modelo.util';
import { categoriaDesdeCapitalizada } from '../../common/categoria.util';
import {
  buildProductId,
  CompraExistente,
  CompraUpdatePlan,
} from './compras.util';

const COSTO_ADICIONAL_DEFAULT = 25028;

export interface NewCompraData {
  fecha: Date;
  marca: string;
  modelo: string;
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
  categoria: string;
}

@Injectable()
export class ComprasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CompraExistente & { id: string }> {
    const compra = await this.prisma.purchase.findUnique({ where: { id } });
    if (!compra) throw new NotFoundException(`Compra ${id} no encontrada`);
    return compra;
  }

  async create(data: NewCompraData) {
    return this.prisma.$transaction(async (tx) => {
      const nuevaCompra = await tx.purchase.create({
        data: {
          fecha: data.fecha,
          marca: data.marca,
          modelo: data.modelo,
          cantidad: data.cantidad,
          costoUnitario: data.costoUnitario,
          costoTotal: data.costoTotal,
          categoria: data.categoria,
        },
      });

      // Inventario: crear o sumar stock
      await tx.inventarioMaestro.upsert({
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

      // Precios: solo se crea la primera vez que se compra este modelo. Si ya existe, no se toca
      // — el precio ya está calculado y las compras posteriores del mismo producto no lo alteran.
      const precioExistente = await tx.precioProducto.findUnique({
        where: { modelo: data.modelo },
      });
      if (!precioExistente) {
        await tx.precioProducto.create({
          data: {
            marca: data.marca,
            modelo: data.modelo,
            costoUnitario: data.costoUnitario,
            costoAdicional: COSTO_ADICIONAL_DEFAULT,
            costoTotal: data.costoUnitario + COSTO_ADICIONAL_DEFAULT,
          },
        });
      }

      // Productos: crear stub si no existe, o habilitar si estaba deshabilitado
      await this.syncProducto(tx, data.marca, data.modelo, data.categoria);

      return nuevaCompra;
    });
  }

  async update(id: string, existing: CompraExistente, plan: CompraUpdatePlan) {
    return this.prisma.$transaction(async (tx) => {
      const compraActualizada = await tx.purchase.update({
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

      // Ajustar inventario
      if (plan.modeloCambio) {
        await tx.inventarioMaestro.updateMany({
          where: { modelo: existing.modelo },
          data: { stock: { decrement: existing.cantidad } },
        });
        await tx.inventarioMaestro.upsert({
          where: { modelo: plan.modelo },
          update: {
            marca: plan.marca,
            stock: { increment: plan.cantidad },
            costoUnitario: plan.costoUnitario,
            categoria: plan.categoria,
          },
          create: {
            marca: plan.marca,
            modelo: plan.modelo,
            stock: plan.cantidad,
            costoUnitario: plan.costoUnitario,
            categoria: plan.categoria,
          },
        });
      } else {
        const diff = plan.cantidad - existing.cantidad;
        await tx.inventarioMaestro.updateMany({
          where: { modelo: plan.modelo },
          data: {
            marca: plan.marca,
            ...(diff !== 0 ? { stock: { increment: diff } } : {}),
            costoUnitario: plan.costoUnitario,
            categoria: plan.categoria,
          },
        });
      }

      // Precios: actualizar solo costo (no tocar precios manuales)
      if (plan.actualizarPrecio) {
        const precioExistente = await tx.precioProducto.findUnique({
          where: { modelo: plan.modeloCambio ? existing.modelo : plan.modelo },
        });
        if (precioExistente) {
          await tx.precioProducto.update({
            where: { modelo: precioExistente.modelo },
            data: {
              marca: plan.marca,
              modelo: plan.modelo,
              costoUnitario: plan.costoUnitario,
              costoTotal: plan.costoUnitario + precioExistente.costoAdicional,
            },
          });
        } else {
          await tx.precioProducto.create({
            data: {
              marca: plan.marca,
              modelo: plan.modelo,
              costoUnitario: plan.costoUnitario,
              costoAdicional: COSTO_ADICIONAL_DEFAULT,
              costoTotal: plan.costoUnitario + COSTO_ADICIONAL_DEFAULT,
            },
          });
        }
      }

      // Si cambió la marca y/o el modelo, renombrar el producto existente en vez de crear uno nuevo.
      if (plan.identidadCambio) {
        const combinedOld = combineMarcaModelo(existing.marca, existing.modelo);
        const combinedNew = combineMarcaModelo(plan.marca, plan.modelo);
        const renombrados = await tx.product.updateMany({
          where: { nombre: { equals: combinedOld, mode: 'insensitive' } },
          data: {
            nombre: combinedNew,
            ...(plan.marca ? { marca: plan.marca } : {}),
          },
        });
        if (renombrados.count === 0) {
          await this.syncProducto(tx, plan.marca, plan.modelo, plan.categoria);
        }
      } else {
        await this.syncProducto(tx, plan.marca, plan.modelo, plan.categoria);
      }

      return compraActualizada;
    });
  }

  /**
   * Crea un producto stub (pendiente) si no existe ninguna variante con ese nombre, o habilita
   * las variantes existentes si estaban deshabilitadas. Solo actúa si hay stock disponible.
   */
  private async syncProducto(
    tx: Prisma.TransactionClient,
    marca: string | null | undefined,
    modelo: string,
    categoria: string,
  ) {
    const inv = await tx.inventarioMaestro.findUnique({ where: { modelo } });
    if (!inv || inv.stock <= 0) return;

    const productos = await findProductsByMarcaModelo(tx, marca, modelo);

    if (productos.length === 0) {
      const cat = categoriaDesdeCapitalizada(categoria);
      const nombreCompleto = combineMarcaModelo(marca, modelo);
      const id = buildProductId(cat, marca, modelo);
      try {
        await tx.product.create({
          data: {
            id,
            nombre: nombreCompleto,
            estilo: '',
            display: nombreCompleto,
            precio: 0,
            disponible: false, // pendiente — admin completa datos e imágenes
            cat,
            imgs: [],
            marca: marca ?? undefined,
          },
        });
      } catch {
        // ID duplicado por colisión de slug: ignorar, el producto ya existe con otro nombre similar
      }
    } else {
      const aHabilitar = productos
        .filter((p) => !p.disponible)
        .map((p) => p.id);
      if (aHabilitar.length > 0) {
        await tx.product.updateMany({
          where: { id: { in: aHabilitar } },
          data: { disponible: true },
        });
      }
      const sinMarca = productos
        .filter((p) => marca && !p.marca)
        .map((p) => p.id);
      if (sinMarca.length > 0) {
        await tx.product.updateMany({
          where: { id: { in: sinMarca } },
          data: { marca },
        });
      }
    }
  }
}
