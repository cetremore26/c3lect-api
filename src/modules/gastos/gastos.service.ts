import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';
import { GastosRepository } from './gastos.repository';

@Injectable()
export class GastosService {
  constructor(
    private readonly gastosRepository: GastosRepository,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.gastosRepository.findAll();
  }

  async create(dto: CreateGastoDto, userId?: string) {
    const gasto = await this.gastosRepository.create({
      fecha: new Date(dto.fecha),
      concepto: dto.concepto,
      monto: dto.monto,
      responsable: dto.responsable ?? null,
      estado: dto.estado ?? null,
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
    await this.gastosRepository.findById(id);

    const data: Prisma.ExpenseUpdateInput = {};
    if (dto.fecha) data.fecha = new Date(dto.fecha);
    if (dto.concepto) data.concepto = dto.concepto;
    if (dto.monto !== undefined) data.monto = dto.monto;
    if (dto.responsable !== undefined) data.responsable = dto.responsable;
    if (dto.estado !== undefined) data.estado = dto.estado;

    const gasto = await this.gastosRepository.update(id, data);

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
    const existing = await this.gastosRepository.findById(id);
    await this.gastosRepository.remove(id);

    await this.audit.log(
      'ELIMINAR',
      'gasto',
      id,
      `Gasto eliminado: ${existing.concepto} — $${existing.monto.toLocaleString('es-CO')}`,
      userId,
    );
  }
}
