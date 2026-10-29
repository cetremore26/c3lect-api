import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG } from '../../../shared/application/ports/audit-log.port';
import type { AuditLogPort } from '../../../shared/application/ports/audit-log.port';
import {
  BusinessRuleViolation,
  NotFoundError,
} from '../../../shared/domain/domain-error';
import type { Promotion, PromotionData } from '../domain/promotion';
import { estaVigente } from '../domain/promotions.util';
import { PROMOTIONS_REPOSITORY } from './ports/promotions-repository.port';
import type { PromotionsRepositoryPort } from './ports/promotions-repository.port';

const conVigencia = (p: Promotion) => ({ ...p, vigente: estaVigente(p) });

@Injectable()
export class PromotionsService {
  constructor(
    @Inject(PROMOTIONS_REPOSITORY)
    private readonly promotionsRepository: PromotionsRepositoryPort,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
  ) {}

  // `vigente` la calcula el dominio: el panel no replica la regla.
  async findAll() {
    const promos = await this.promotionsRepository.findAll();
    return promos.map(conVigencia);
  }

  async findOne(id: string) {
    return conVigencia(await this.findExisting(id));
  }

  async create(data: PromotionData, userId?: string) {
    this.validateFechas(data.fechaInicio, data.fechaFin);
    const promo = await this.promotionsRepository.create(data);
    await this.audit.log(
      'CREAR',
      'promocion',
      promo.id,
      `Promoción creada: ${promo.nombre}`,
      userId,
    );
    return promo;
  }

  async update(id: string, data: Partial<PromotionData>, userId?: string) {
    const actual = await this.findExisting(id);
    if (data.fechaInicio || data.fechaFin) {
      this.validateFechas(
        data.fechaInicio ?? actual.fechaInicio.toISOString(),
        data.fechaFin ?? actual.fechaFin.toISOString(),
      );
    }
    const promo = await this.promotionsRepository.update(id, data);
    await this.audit.log(
      'EDITAR',
      'promocion',
      id,
      `Promoción editada: ${promo.nombre}`,
      userId,
    );
    return promo;
  }

  async remove(id: string, userId?: string) {
    await this.findExisting(id);
    await this.promotionsRepository.remove(id);
    await this.audit.log(
      'ELIMINAR',
      'promocion',
      id,
      `Promoción eliminada: ${id}`,
      userId,
    );
    return { message: `Promoción "${id}" eliminada` };
  }

  private async findExisting(id: string) {
    const promo = await this.promotionsRepository.findById(id);
    if (!promo) throw new NotFoundError(`Promoción "${id}" no encontrada`);
    return promo;
  }

  private validateFechas(fechaInicio: string, fechaFin: string): void {
    if (new Date(fechaFin) <= new Date(fechaInicio)) {
      throw new BusinessRuleViolation(
        'fechaFin debe ser posterior a fechaInicio',
      );
    }
  }
}
