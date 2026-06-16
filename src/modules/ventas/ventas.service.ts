import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { calcGananciaPorVenta } from '../metrics/metrics.service';
import { CreateVentaDto } from './dto/create-venta.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';

@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateVentaDto) {
    const saldoPendiente = dto.precioVenta > 0 ? Math.max(0, dto.precioVenta - dto.abono) : 0;
    const gananciaNeta = calcGananciaPorVenta(dto.estado, dto.precioVenta, dto.costoProducto, dto.costoEnvio, dto.abono);

    const venta = await this.prisma.historicalSale.create({
      data: {
        fecha: new Date(dto.fecha),
        cliente: dto.cliente,
        celular: dto.celular ?? null,
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
      },
    });

    await this.prisma.inventarioMaestro.updateMany({
      where: { modelo: dto.modelo },
      data: { stock: { decrement: 1 } },
    });

    await this.audit.log(
      'CREAR', 'venta', venta.id,
      `Nueva venta: ${dto.modelo} — ${dto.cliente} (${dto.estado})`,
    );

    return venta;
  }

  async update(id: string, dto: UpdateVentaDto) {
    const existing = await this.prisma.historicalSale.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Venta ${id} no encontrada`);

    const precioVenta   = dto.precioVenta   ?? existing.precioVenta;
    const costoProducto = dto.costoProducto ?? existing.costoProducto;
    const costoEnvio    = dto.costoEnvio    ?? existing.costoEnvio;
    const abono         = dto.abono         ?? existing.abono;

    let estado = dto.estado ?? existing.estado;
    if (precioVenta > 0 && abono >= precioVenta) {
      estado = 'Pagado';
    }

    const saldoPendiente = precioVenta > 0 ? Math.max(0, precioVenta - abono) : 0;
    const gananciaNeta   = calcGananciaPorVenta(estado, precioVenta, costoProducto, costoEnvio, abono);

    const venta = await this.prisma.historicalSale.update({
      where: { id },
      data: {
        fecha:          dto.fecha    ? new Date(dto.fecha)             : existing.fecha,
        cliente:        dto.cliente  ?? existing.cliente,
        celular:        dto.celular  !== undefined ? dto.celular        : existing.celular,
        modelo:         dto.modelo   ?? existing.modelo,
        estilo:         dto.estilo   !== undefined ? dto.estilo         : existing.estilo,
        fuente:         dto.fuente   !== undefined ? dto.fuente         : existing.fuente,
        precioVenta,
        costoProducto,
        costoEnvio,
        abono,
        saldoPendiente,
        gananciaNeta,
        estado,
      },
    });

    await this.audit.log(
      'EDITAR', 'venta', id,
      `Venta editada: ${venta.modelo} — ${venta.cliente} | Abono: ${abono} | Estado: ${estado}`,
    );

    return venta;
  }
}
