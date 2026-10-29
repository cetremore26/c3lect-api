import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG } from '../../../shared/application/ports/audit-log.port';
import type { AuditLogPort } from '../../../shared/application/ports/audit-log.port';
import { EVENT_BUS } from '../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../shared/application/ports/event-bus.port';
import { UNIT_OF_WORK } from '../../../shared/application/ports/unit-of-work.port';
import type { UnitOfWorkPort } from '../../../shared/application/ports/unit-of-work.port';
import { NotFoundError } from '../../../shared/domain/domain-error';
import { combineMarcaModelo } from '../../../shared/domain/marca-modelo.util';
import { CompraCorregida, CompraRegistrada } from '../domain/compra-events';
import {
  CompraUpdateDto,
  costoTotalCompra,
  planCompraUpdate,
} from '../domain/compras.util';
import { COMPRAS_REPOSITORY } from './ports/compras-repository.port';
import type { ComprasRepositoryPort } from './ports/compras-repository.port';

export interface CreateCompraCommand {
  fecha: string;
  marca: string;
  modelo: string;
  cantidad: number;
  costoUnitario: number;
  categoria: string;
}

@Injectable()
export class ComprasService {
  constructor(
    @Inject(COMPRAS_REPOSITORY)
    private readonly comprasRepository: ComprasRepositoryPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
  ) {}

  // La compra y sus efectos (stock, costo en precios, producto en el
  // catálogo) en una sola transacción: cada contexto reacciona a
  // CompraRegistrada escribiendo en sus propias tablas.
  async create(cmd: CreateCompraCommand, userId?: string) {
    const costoTotal = costoTotalCompra(cmd.cantidad, cmd.costoUnitario);

    const compra = await this.uow.run(async () => {
      const nueva = await this.comprasRepository.create({
        fecha: new Date(cmd.fecha),
        marca: cmd.marca,
        modelo: cmd.modelo,
        cantidad: cmd.cantidad,
        costoUnitario: cmd.costoUnitario,
        costoTotal,
        categoria: cmd.categoria,
      });
      await this.events.publish(
        new CompraRegistrada({
          compraId: nueva.id,
          marca: cmd.marca,
          modelo: cmd.modelo,
          cantidad: cmd.cantidad,
          costoUnitario: cmd.costoUnitario,
          categoria: cmd.categoria,
        }),
      );
      return nueva;
    });

    await this.audit.log(
      'CREAR',
      'compra',
      compra.id,
      `Nueva compra: ${cmd.cantidad}x ${combineMarcaModelo(cmd.marca, cmd.modelo)} — $${costoTotal.toLocaleString('es-CO')}`,
      userId,
    );

    return compra;
  }

  async update(id: string, dto: CompraUpdateDto, userId?: string) {
    const existing = await this.comprasRepository.findById(id);
    if (!existing) throw new NotFoundError(`Compra ${id} no encontrada`);
    const plan = planCompraUpdate(existing, dto);

    const compra = await this.uow.run(async () => {
      const actualizada = await this.comprasRepository.update(id, plan);
      await this.events.publish(
        new CompraCorregida({
          compraId: id,
          anterior: {
            marca: existing.marca,
            modelo: existing.modelo,
            cantidad: existing.cantidad,
          },
          nueva: {
            marca: plan.marca,
            modelo: plan.modelo,
            cantidad: plan.cantidad,
            costoUnitario: plan.costoUnitario,
            categoria: plan.categoria,
          },
          modeloCambio: plan.modeloCambio,
          identidadCambio: plan.identidadCambio,
          actualizarPrecio: plan.actualizarPrecio,
        }),
      );
      return actualizada;
    });

    await this.audit.log(
      'EDITAR',
      'compra',
      id,
      `Compra editada: ${combineMarcaModelo(plan.marca, plan.modelo)} — ${plan.cantidad} ud${plan.cantidad !== 1 ? 's' : ''} a $${plan.costoUnitario.toLocaleString('es-CO')}`,
      userId,
    );

    return compra;
  }
}
