import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG } from '../../../shared/application/ports/audit-log.port';
import type { AuditLogPort } from '../../../shared/application/ports/audit-log.port';
import { EVENT_BUS } from '../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../shared/application/ports/event-bus.port';
import { UNIT_OF_WORK } from '../../../shared/application/ports/unit-of-work.port';
import type { UnitOfWorkPort } from '../../../shared/application/ports/unit-of-work.port';
import { NotFoundError } from '../../../shared/domain/domain-error';
import { combineMarcaModelo } from '../../../shared/domain/marca-modelo.util';
import { calcGananciaPorVenta } from '../domain/ganancia';
import { VentaEliminada, VentaManualRegistrada } from '../domain/venta-events';
import {
  calcularSaldoPendiente,
  esElegibleParaMetaOffline,
  planVentaUpdate,
  VentaUpdateDto,
} from '../domain/ventas.util';
import { VENTAS_REPOSITORY } from './ports/ventas-repository.port';
import type { VentasRepositoryPort } from './ports/ventas-repository.port';

export interface CreateVentaCommand {
  fecha: string;
  cliente: string;
  celular?: string;
  marca: string;
  modelo: string;
  estilo?: string;
  precioVenta: number;
  costoProducto: number;
  costoEnvio: number;
  abono: number;
  fuente?: string;
  estado: string;
}

@Injectable()
export class VentasService {
  constructor(
    @Inject(VENTAS_REPOSITORY)
    private readonly ventasRepository: VentasRepositoryPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
  ) {}

  // La venta y la salida de stock en una transacción: inventario reacciona a
  // VentaManualRegistrada y, si no hay stock, la venta tampoco se guarda. El
  // envío a Meta (si es elegible) lo hace meta-conversions tras el commit.
  async create(cmd: CreateVentaCommand, userId?: string) {
    const saldoPendiente = calcularSaldoPendiente(cmd.precioVenta, cmd.abono);
    const gananciaNeta = calcGananciaPorVenta(
      cmd.estado,
      cmd.precioVenta,
      cmd.costoProducto,
      cmd.costoEnvio,
      cmd.abono,
    );

    const venta = await this.uow.run(async () => {
      const nueva = await this.ventasRepository.create({
        fecha: new Date(cmd.fecha),
        cliente: cmd.cliente,
        celular: cmd.celular ?? null,
        marca: cmd.marca,
        modelo: cmd.modelo,
        estilo: cmd.estilo ?? null,
        precioVenta: cmd.precioVenta,
        costoProducto: cmd.costoProducto,
        costoEnvio: cmd.costoEnvio,
        abono: cmd.abono,
        saldoPendiente,
        gananciaNeta,
        fuente: cmd.fuente ?? null,
        estado: cmd.estado,
      });

      await this.events.publish(
        new VentaManualRegistrada({
          ventaId: nueva.id,
          marca: cmd.marca,
          modelo: cmd.modelo,
          cliente: cmd.cliente,
          celular: cmd.celular ?? null,
          precioVenta: cmd.precioVenta,
          fecha: new Date(cmd.fecha),
          elegibleMetaOffline: esElegibleParaMetaOffline(cmd),
        }),
      );

      return nueva;
    });

    await this.audit.log(
      'CREAR',
      'venta',
      venta.id,
      `Nueva venta: ${combineMarcaModelo(cmd.marca, cmd.modelo)} — ${cmd.cliente} (${cmd.estado})`,
      userId,
    );

    return venta;
  }

  async update(id: string, dto: VentaUpdateDto, userId?: string) {
    const existing = await this.findExisting(id);
    const plan = planVentaUpdate(existing, dto);

    const venta = await this.ventasRepository.update(id, plan);

    await this.audit.log(
      'EDITAR',
      'venta',
      id,
      `Venta editada: ${venta.modelo} — ${venta.cliente} | Abono: ${plan.abono} | Estado: ${plan.estado}`,
      userId,
    );

    return venta;
  }

  async remove(id: string, userId?: string) {
    const existing = await this.findExisting(id);

    // TODO: si existing.orderId está presente, esta venta la generó la
    // confirmación de un pedido de la plataforma. Borrarla aquí devuelve el
    // stock OTRA VEZ, independiente de lo que haga después el pedido — puede
    // reponer dos veces si el pedido también se cancela. Falta decidir si se
    // bloquea este endpoint para ventas con orderId, o se redirige al flujo
    // de pedidos.
    await this.uow.run(async () => {
      await this.ventasRepository.remove(id);
      await this.events.publish(
        new VentaEliminada({
          ventaId: id,
          marca: existing.marca,
          modelo: existing.modelo,
        }),
      );
    });

    await this.audit.log(
      'ELIMINAR',
      'venta',
      id,
      `Venta eliminada: ${existing.modelo} — ${existing.cliente}`,
      userId,
    );

    return { mensaje: 'Venta eliminada correctamente' };
  }

  private async findExisting(id: string) {
    const venta = await this.ventasRepository.findById(id);
    if (!venta) throw new NotFoundError(`Venta ${id} no encontrada`);
    return venta;
  }
}
