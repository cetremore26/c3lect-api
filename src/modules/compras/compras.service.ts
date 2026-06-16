import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { UpdateCompraDto } from './dto/update-compra.dto';

const COSTO_ADICIONAL_DEFAULT = 25028;

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

    if (dto.modelo && dto.modelo !== existing.modelo) {
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

    await this.audit.log(
      'EDITAR', 'compra', id,
      `Compra editada: ${modelo} — ${cantidad} ud${cantidad !== 1 ? 's' : ''} a $${costoUnitario.toLocaleString('es-CO')}`,
    );

    return compra;
  }
}
