import { Injectable } from '@nestjs/common';
import { calcGananciaPorVenta } from '../metrics/metrics.service';
import { CreateVentaDto } from './dto/create-venta.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';
import { combineMarcaModelo } from '../../common/marca-modelo.util';
import { MetaConversionsService } from '../meta-conversions/meta-conversions.service';
import { AuditService } from '../audit/audit.service';
import { VentasRepository } from './ventas.repository';
import {
  calcularSaldoPendiente,
  esElegibleParaMetaOffline,
  planVentaUpdate,
} from './ventas.util';

@Injectable()
export class VentasService {
  constructor(
    private readonly ventasRepository: VentasRepository,
    private readonly audit: AuditService,
    private readonly metaConversions: MetaConversionsService,
  ) {}

  async create(dto: CreateVentaDto, userId?: string) {
    const saldoPendiente = calcularSaldoPendiente(dto.precioVenta, dto.abono);
    const gananciaNeta = calcGananciaPorVenta(
      dto.estado,
      dto.precioVenta,
      dto.costoProducto,
      dto.costoEnvio,
      dto.abono,
    );

    const venta = await this.ventasRepository.create({
      fecha: new Date(dto.fecha),
      cliente: dto.cliente,
      celular: dto.celular ?? null,
      marca: dto.marca,
      modelo: dto.modelo,
      estilo: dto.estilo ?? null,
      precioVenta: dto.precioVenta,
      costoProducto: dto.costoProducto,
      costoEnvio: dto.costoEnvio,
      abono: dto.abono,
      saldoPendiente,
      gananciaNeta,
      fuente: dto.fuente ?? null,
      estado: dto.estado,
    });

    await this.audit.log(
      'CREAR',
      'venta',
      venta.id,
      `Nueva venta: ${combineMarcaModelo(dto.marca, dto.modelo)} — ${dto.cliente} (${dto.estado})`,
      userId,
    );

    if (esElegibleParaMetaOffline(dto)) {
      void this.metaConversions.sendOfflinePurchase({
        ventaId: venta.id,
        total: dto.precioVenta,
        user: {
          phone: dto.celular,
          firstName: dto.cliente.trim().split(' ')[0],
          lastName: dto.cliente.trim().split(' ').slice(1).join(' '),
        },
        eventTime: Math.floor(new Date(dto.fecha).getTime() / 1000),
      });
    }

    return venta;
  }

  async update(id: string, dto: UpdateVentaDto, userId?: string) {
    const existing = await this.ventasRepository.findById(id);
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
    const existing = await this.ventasRepository.findById(id);

    // TODO: si existing.orderId está presente, esta venta fue generada por
    // OrdersService.updateStatus() al confirmar un pedido de la plataforma.
    // Borrarla aquí manualmente revierte el stock OTRA VEZ, independiente de
    // lo que ya hizo OrdersService — puede descontar el stock dos veces si el
    // pedido también se cancela/elimina después. Falta decidir si se bloquea
    // este endpoint para ventas con orderId, o se redirige al flujo de pedidos.
    await this.ventasRepository.remove(id, existing);

    await this.audit.log(
      'ELIMINAR',
      'venta',
      id,
      `Venta eliminada: ${existing.modelo} — ${existing.cliente}`,
      userId,
    );

    return { mensaje: 'Venta eliminada correctamente' };
  }
}
