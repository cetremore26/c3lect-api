import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { UpdateCompraDto } from './dto/update-compra.dto';
import { combineMarcaModelo, findProductsByMarcaModelo } from '../../common/marca-modelo.util';

const COSTO_ADICIONAL_DEFAULT = 25028;

const CAT_MAP: Record<string, string> = {
  Reloj: 'reloj',
  Perfume: 'perfume',
  Accesorio: 'accesorio',
};

const CAT_PREFIX: Record<string, string> = {
  reloj: 'r',
  perfume: 'p',
  accesorio: 'a',
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i').replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9&-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Convención de IDs del catálogo: {r|p|a}-marca-modelo(-estilo si aplica), ej. "r-curren-8442-blue-white".
function buildProductId(cat: string, marca: string | null | undefined, modelo: string, estilo?: string): string {
  const prefijo = CAT_PREFIX[cat] ?? 'r';
  const partes = [slugify(marca ?? ''), slugify(modelo), estilo ? slugify(estilo) : ''].filter(Boolean);
  return [prefijo, ...partes].join('-');
}

@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateCompraDto) {
    const costoTotal = dto.cantidad * dto.costoUnitario;

    const compra = await this.prisma.$transaction(async (tx) => {
      const nuevaCompra = await tx.purchase.create({
        data: {
          fecha: new Date(dto.fecha),
          marca: dto.marca,
          modelo: dto.modelo,
          cantidad: dto.cantidad,
          costoUnitario: dto.costoUnitario,
          costoTotal,
          categoria: dto.categoria,
        },
      });

      // Inventario: crear o sumar stock
      await tx.inventarioMaestro.upsert({
        where: { modelo: dto.modelo },
        update: {
          marca: dto.marca,
          stock: { increment: dto.cantidad },
          costoUnitario: dto.costoUnitario,
          categoria: dto.categoria,
        },
        create: {
          marca: dto.marca,
          modelo: dto.modelo,
          stock: dto.cantidad,
          costoUnitario: dto.costoUnitario,
          categoria: dto.categoria,
        },
      });

      // Precios: solo se crea la primera vez que se compra este modelo. Si ya existe, no se toca
      // — el precio ya está calculado y las compras posteriores del mismo producto no lo alteran.
      const precioExistente = await tx.precioProducto.findUnique({ where: { modelo: dto.modelo } });
      if (!precioExistente) {
        await tx.precioProducto.create({
          data: {
            marca: dto.marca,
            modelo: dto.modelo,
            costoUnitario: dto.costoUnitario,
            costoAdicional: COSTO_ADICIONAL_DEFAULT,
            costoTotal: dto.costoUnitario + COSTO_ADICIONAL_DEFAULT,
            // precioPublico y precioCierre quedan null — admin los completa
          },
        });
      }

      // Productos: crear stub si no existe, o habilitar si estaba deshabilitado
      await this.syncProducto(tx, dto.marca, dto.modelo, dto.categoria, 'create');

      return nuevaCompra;
    });

    await this.audit.log(
      'CREAR', 'compra', compra.id,
      `Nueva compra: ${dto.cantidad}x ${combineMarcaModelo(dto.marca, dto.modelo)} — $${costoTotal.toLocaleString('es-CO')}`,
    );

    return compra;
  }

  async update(id: string, dto: UpdateCompraDto) {
    const existing = await this.prisma.purchase.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Compra ${id} no encontrada`);

    const marca           = dto.marca         ?? existing.marca;
    const modelo           = dto.modelo        ?? existing.modelo;
    const cantidad          = dto.cantidad      ?? existing.cantidad;
    const costoUnitario     = dto.costoUnitario ?? existing.costoUnitario;
    const categoria         = dto.categoria     ?? existing.categoria;
    const costoTotal        = cantidad * costoUnitario;
    const modeloCambio      = dto.modelo && dto.modelo !== existing.modelo;
    const identidadCambio   = Boolean(modeloCambio) || (dto.marca !== undefined && dto.marca !== existing.marca);

    const compra = await this.prisma.$transaction(async (tx) => {
      const compraActualizada = await tx.purchase.update({
        where: { id },
        data: {
          fecha: dto.fecha ? new Date(dto.fecha) : existing.fecha,
          marca,
          modelo,
          cantidad,
          costoUnitario,
          costoTotal,
          categoria,
        },
      });

      // Ajustar inventario
      if (modeloCambio) {
        await tx.inventarioMaestro.updateMany({
          where: { modelo: existing.modelo },
          data: { stock: { decrement: existing.cantidad } },
        });
        await tx.inventarioMaestro.upsert({
          where: { modelo },
          update: { marca, stock: { increment: cantidad }, costoUnitario, categoria },
          create: { marca, modelo, stock: cantidad, costoUnitario, categoria },
        });
      } else {
        const diff = cantidad - existing.cantidad;
        await tx.inventarioMaestro.updateMany({
          where: { modelo },
          data: {
            marca,
            ...(diff !== 0 ? { stock: { increment: diff } } : {}),
            costoUnitario,
            categoria,
          },
        });
      }

      // Precios: actualizar solo costo (no tocar precios manuales)
      if (dto.costoUnitario !== undefined || identidadCambio) {
        const precioExistente = await tx.precioProducto.findUnique({
          where: { modelo: modeloCambio ? existing.modelo : modelo },
        });
        if (precioExistente) {
          await tx.precioProducto.update({
            where: { modelo: precioExistente.modelo },
            data: {
              marca,
              modelo,
              costoUnitario,
              costoTotal: costoUnitario + precioExistente.costoAdicional,
            },
          });
        } else {
          await tx.precioProducto.create({
            data: {
              marca,
              modelo,
              costoUnitario,
              costoAdicional: COSTO_ADICIONAL_DEFAULT,
              costoTotal: costoUnitario + COSTO_ADICIONAL_DEFAULT,
            },
          });
        }
      }

      // Si cambió la marca y/o el modelo, renombrar el producto existente en vez de crear uno nuevo.
      // combineMarcaModelo(existing.marca, existing.modelo) colapsa a solo "modelo" cuando la fila
      // vieja todavía no tenía marca (no migrada), así que esta única comparación cubre ambos casos.
      if (identidadCambio) {
        const combinedOld = combineMarcaModelo(existing.marca, existing.modelo);
        const combinedNew = combineMarcaModelo(marca, modelo);
        const renombrados = await tx.product.updateMany({
          where: { nombre: { equals: combinedOld, mode: 'insensitive' } },
          data: { nombre: combinedNew, ...(marca ? { marca } : {}) },
        });
        if (renombrados.count === 0) {
          await this.syncProducto(tx, marca, modelo, categoria, 'update');
        }
      } else {
        await this.syncProducto(tx, marca, modelo, categoria, 'update');
      }

      return compraActualizada;
    });

    await this.audit.log(
      'EDITAR', 'compra', id,
      `Compra editada: ${combineMarcaModelo(marca, modelo)} — ${cantidad} ud${cantidad !== 1 ? 's' : ''} a $${costoUnitario.toLocaleString('es-CO')}`,
    );

    return compra;
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
    _op: 'create' | 'update',
  ) {
    const inv = await tx.inventarioMaestro.findUnique({ where: { modelo } });
    if (!inv || inv.stock <= 0) return;

    const productos = await findProductsByMarcaModelo(tx, marca, modelo);

    if (productos.length === 0) {
      const cat = CAT_MAP[categoria] ?? 'reloj';
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
      const aHabilitar = productos.filter((p) => !p.disponible).map((p) => p.id);
      if (aHabilitar.length > 0) {
        // Tenemos stock de nuevo — habilitar variantes
        await tx.product.updateMany({
          where: { id: { in: aHabilitar } },
          data: { disponible: true },
        });
      }
      // Si el producto ya existe pero todavía no tiene marca registrada, completarla ahora.
      const sinMarca = productos.filter((p) => marca && !p.marca).map((p) => p.id);
      if (sinMarca.length > 0) {
        await tx.product.updateMany({
          where: { id: { in: sinMarca } },
          data: { marca },
        });
      }
    }
  }
}
