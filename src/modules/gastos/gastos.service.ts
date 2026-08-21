import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';

@Injectable()
export class GastosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.expense.findMany({ orderBy: { fecha: 'desc' } });
  }

  async create(dto: CreateGastoDto, userId?: string) {
    const gasto = await this.prisma.expense.create({
      data: {
        fecha: new Date(dto.fecha),
        concepto: dto.concepto,
        monto: dto.monto,
        responsable: dto.responsable ?? null,
        estado: dto.estado ?? null,
      },
    });

    await this.audit.log(
      'CREAR',
      'gasto',
      gasto.id,
      `Nuevo gasto: ${dto.concepto} — $${dto.monto.toLocaleString('es-CO')}`,
      userId,
    );

    return gasto;
  }

  async update(id: string, dto: UpdateGastoDto, userId?: string) {
    const existing = await this.assertExists(id);
    const data: any = {};
    if (dto.fecha) data.fecha = new Date(dto.fecha);
    if (dto.concepto) data.concepto = dto.concepto;
    if (dto.monto !== undefined) data.monto = dto.monto;
    if (dto.responsable !== undefined) data.responsable = dto.responsable;
    if (dto.estado !== undefined) data.estado = dto.estado;

    const gasto = await this.prisma.expense.update({ where: { id }, data });

    await this.audit.log(
      'EDITAR',
      'gasto',
      id,
      `Gasto editado: ${gasto.concepto} — $${gasto.monto.toLocaleString('es-CO')}`,
      userId,
    );

    return gasto;
  }

  async remove(id: string, userId?: string) {
    const existing = await this.assertExists(id);
    await this.prisma.expense.delete({ where: { id } });

    await this.audit.log(
      'ELIMINAR',
      'gasto',
      id,
      `Gasto eliminado: ${existing.concepto} — $${existing.monto.toLocaleString('es-CO')}`,
      userId,
    );
  }

  private async assertExists(id: string) {
    const found = await this.prisma.expense.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`Gasto ${id} no encontrado`);
    return found;
  }
}
