import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { UpdateCompraDto } from './dto/update-compra.dto';

const COSTO_ADICIONAL_DEFAULT = 25028;

@Injectable()
export class ComprasService {
  constructor(private readonly prisma: PrismaService) {}

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

    await this.prisma.precioProducto.upsert({
      where: { modelo: dto.modelo },
      update: {
        costoUnitario: dto.costoUnitario,
        costoTotal: dto.costoUnitario + COSTO_ADICIONAL_DEFAULT,
      },
      create: {
        modelo: dto.modelo,
        costoUnitario: dto.costoUnitario,
        costoAdicional: COSTO_ADICIONAL_DEFAULT,
        costoTotal: dto.costoUnitario + COSTO_ADICIONAL_DEFAULT,
      },
    });

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

    // Ajustar inventario según qué cambió
    if (dto.modelo && dto.modelo !== existing.modelo) {
      // Modelo cambió: revertir stock del modelo viejo, sumar al nuevo
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
      // Mismo modelo: ajustar diferencia de cantidad y actualizar costo/categoría
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

    // Actualizar precios si cambió costoUnitario o modelo
    if (dto.costoUnitario !== undefined || (dto.modelo && dto.modelo !== existing.modelo)) {
      await this.prisma.precioProducto.upsert({
        where: { modelo },
        update: { costoUnitario, costoTotal: costoUnitario + COSTO_ADICIONAL_DEFAULT },
        create: {
          modelo,
          costoUnitario,
          costoAdicional: COSTO_ADICIONAL_DEFAULT,
          costoTotal: costoUnitario + COSTO_ADICIONAL_DEFAULT,
        },
      });
    }

    return compra;
  }
}
