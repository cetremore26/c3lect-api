import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { UpdateCompraDto } from './dto/update-compra.dto';

const COSTO_ADICIONAL_DEFAULT = 25028;

const CAT_MAP: Record<string, string> = {
  Reloj: 'reloj',
  Perfume: 'perfume',
  Accesorio: 'accesorio',
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i').replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateCompraDto) {
    const costoTotal = dto.cantidad * dto.costoUnitario;

    const compra = await this.prisma.purchase.create({
      data: {
        fecha: new Date(dto.fecha),
        modelo: dto.modelo,
        cantidad: dto.cantidad,
        costoUnitario: dto.costoUnitario,
        costoTotal,
        categoria: dto.categoria,
      },
    });

    // Inventario: crear o sumar stock
    await this.prisma.inventarioMaestro.upsert({
      where: { modelo: dto.modelo },
      update: {
        stock: { increment: dto.cantidad },
        costoUnitario: dto.costoUnitario,
        categoria: dto.categoria,
      },
      create: {
        modelo: dto.modelo,
        stock: dto.cantidad,
        costoUnitario: dto.costoUnitario,
        categoria: dto.categoria,
      },
    });

    // Precios: solo crear si no existe (no sobreescribir precios manuales)
    const precioExistente = await this.prisma.precioProducto.findUnique({ where: { modelo: dto.modelo } });
    if (!precioExistente) {
      await this.prisma.precioProducto.create({
        data: {
          modelo: dto.modelo,
          costoUnitario: dto.costoUnitario,
          costoAdicional: COSTO_ADICIONAL_DEFAULT,
          costoTotal: dto.costoUnitario + COSTO_ADICIONAL_DEFAULT,
          // precioPublico y precioCierre quedan null — admin los completa
        },
      });
    } else {
      // Solo actualizar campos de costo, respetar precios fijados manualmente
      await this.prisma.precioProducto.update({
        where: { modelo: dto.modelo },
        data: {
          costoUnitario: dto.costoUnitario,
          costoTotal: dto.costoUnitario + precioExistente.costoAdicional,
        },
      });
    }

    // Productos: crear stub si no existe, o habilitar si estaba deshabilitado
    await this.syncProducto(dto.modelo, dto.categoria, 'create');

    await this.audit.log(
      'CREAR', 'compra', compra.id,
      `Nueva compra: ${dto.cantidad}x ${dto.modelo} — $${costoTotal.toLocaleString('es-CO')}`,
    );

    return compra;
  }

  async update(id: string, dto: UpdateCompraDto) {
    const existing = await this.prisma.purchase.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Compra ${id} no encontrada`);

    const modelo        = dto.modelo        ?? existing.modelo;
    const cantidad      = dto.cantidad      ?? existing.cantidad;
    const costoUnitario = dto.costoUnitario ?? existing.costoUnitario;
    const categoria     = dto.categoria     ?? existing.categoria;
    const costoTotal    = cantidad * costoUnitario;
    const modeloCambio  = dto.modelo && dto.modelo !== existing.modelo;

    const compra = await this.prisma.purchase.update({
      where: { id },
      data: {
        fecha: dto.fecha ? new Date(dto.fecha) : existing.fecha,
        modelo,
        cantidad,
        costoUnitario,
        costoTotal,
        categoria,
      },
    });

    // Ajustar inventario
    if (modeloCambio) {
      await this.prisma.inventarioMaestro.updateMany({
        where: { modelo: existing.modelo },
        data: { stock: { decrement: existing.cantidad } },
      });
      await this.prisma.inventarioMaestro.upsert({
        where: { modelo },
        update: { stock: { increment: cantidad }, costoUnitario, categoria },
        create: { modelo, stock: cantidad, costoUnitario, categoria },
      });
    } else {
      const diff = cantidad - existing.cantidad;
      await this.prisma.inventarioMaestro.updateMany({
        where: { modelo },
        data: {
          ...(diff !== 0 ? { stock: { increment: diff } } : {}),
          costoUnitario,
          categoria,
        },
      });
    }

    // Precios: actualizar solo costo (no tocar precios manuales)
    if (dto.costoUnitario !== undefined || modeloCambio) {
      const precioExistente = await this.prisma.precioProducto.findUnique({ where: { modelo } });
      if (precioExistente) {
        await this.prisma.precioProducto.update({
          where: { modelo },
          data: {
            costoUnitario,
            costoTotal: costoUnitario + precioExistente.costoAdicional,
          },
        });
      } else {
        await this.prisma.precioProducto.create({
          data: {
            modelo,
            costoUnitario,
            costoAdicional: COSTO_ADICIONAL_DEFAULT,
            costoTotal: costoUnitario + COSTO_ADICIONAL_DEFAULT,
          },
        });
      }
    }

    // Sync producto del modelo nuevo/actual
    await this.syncProducto(modelo, categoria, 'update');

    // Si el modelo cambió, verificar si el modelo viejo quedó sin stock
    if (modeloCambio) {
      const invViejo = await this.prisma.inventarioMaestro.findUnique({ where: { modelo: existing.modelo } });
      if (!invViejo || invViejo.stock <= 0) {
        await this.prisma.product.updateMany({
          where: { nombre: { equals: existing.modelo, mode: 'insensitive' }, disponible: true },
          data: { disponible: false },
        });
      }
    }

    await this.audit.log(
      'EDITAR', 'compra', id,
      `Compra editada: ${modelo} — ${cantidad} ud${cantidad !== 1 ? 's' : ''} a $${costoUnitario.toLocaleString('es-CO')}`,
    );

    return compra;
  }

  /**
   * Crea un producto stub (pendiente) si no existe ninguna variante con ese nombre, o habilita
   * las variantes existentes si estaban deshabilitadas. Solo actúa si hay stock disponible.
   */
  private async syncProducto(modelo: string, categoria: string, _op: 'create' | 'update') {
    const inv = await this.prisma.inventarioMaestro.findUnique({ where: { modelo } });
    if (!inv || inv.stock <= 0) return;

    const productos = await this.prisma.product.findMany({
      where: { nombre: { equals: modelo, mode: 'insensitive' } },
    });

    if (productos.length === 0) {
      const cat = CAT_MAP[categoria] ?? 'reloj';
      const id  = slugify(modelo);
      try {
        await this.prisma.product.create({
          data: {
            id,
            nombre: modelo,
            estilo: '',
            display: modelo,
            precio: 0,
            disponible: false, // pendiente — admin completa datos e imágenes
            cat,
            imgs: [],
          },
        });
      } catch {
        // ID duplicado por colisión de slug: ignorar, el producto ya existe con otro nombre similar
      }
    } else {
      const aHabilitar = productos.filter((p) => !p.disponible).map((p) => p.id);
      if (aHabilitar.length > 0) {
        // Tenemos stock de nuevo — habilitar variantes
        await this.prisma.product.updateMany({
          where: { id: { in: aHabilitar } },
          data: { disponible: true },
        });
      }
    }
  }
}
