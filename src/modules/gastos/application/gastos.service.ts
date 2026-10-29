import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG } from '../../../shared/application/ports/audit-log.port';
import type { AuditLogPort } from '../../../shared/application/ports/audit-log.port';
import { NotFoundError } from '../../../shared/domain/domain-error';
import { GASTOS_REPOSITORY } from './ports/gastos-repository.port';
import type {
  GastosRepositoryPort,
  NewGastoData,
} from './ports/gastos-repository.port';

export interface CreateGastoCommand {
  fecha: string;
  concepto: string;
  monto: number;
  responsable?: string;
  estado?: string;
}

@Injectable()
export class GastosService {
  constructor(
    @Inject(GASTOS_REPOSITORY)
    private readonly gastosRepository: GastosRepositoryPort,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
  ) {}

  findAll() {
    return this.gastosRepository.findAll();
  }

  async create(dto: CreateGastoCommand, userId?: string) {
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

  async update(id: string, dto: Partial<CreateGastoCommand>, userId?: string) {
    await this.findExisting(id);

    const data: Partial<NewGastoData> = {};
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
    const existing = await this.findExisting(id);
    await this.gastosRepository.remove(id);

    await this.audit.log(
      'ELIMINAR',
      'gasto',
      id,
      `Gasto eliminado: ${existing.concepto} — $${existing.monto.toLocaleString('es-CO')}`,
      userId,
    );
  }

  private async findExisting(id: string) {
    const gasto = await this.gastosRepository.findById(id);
    if (!gasto) throw new NotFoundError(`Gasto ${id} no encontrado`);
    return gasto;
  }
}
