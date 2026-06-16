import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { calcGananciaPorVenta } from '../metrics/metrics.service';
import { CreateVentaDto } from './dto/create-venta.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';

@Injectable()
export class VentasService {
  constructor(private readonly prisma: PrismaService) {}

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

    // Toda venta (incluso Uso Personal) descuenta una unidad del inventario
    await this.prisma.inventarioMaestro.updateMany({
      where: { modelo: dto.modelo },
      data: { stock: { decrement: 1 } },
    });

    return venta;
  }

  async update(id: string, dto: UpdateVentaDto) {
    const existing = await this.prisma.historicalSale.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Venta ${id} no encontrada`);

    const precioVenta   = dto.precioVenta   ?? existing.precioVenta;
    const costoProducto = dto.costoProducto ?? existing.costoProducto;
    const costoEnvio    = dto.costoEnvio    ?? existing.costoEnvio;
    const abono         = dto.abono         ?? existing.abono;

    // Auto-set estado a "Pagado" cuando el abono cubre el precio
    let estado = dto.estado ?? existing.estado;
    if (precioVenta > 0 && abono >= precioVenta) {
      estado = 'Pagado';
    }

    const saldoPendiente = precioVenta > 0 ? Math.max(0, precioVenta - abono) : 0;
    const gananciaNeta   = calcGananciaPorVenta(estado, precioVenta, costoProducto, costoEnvio, abono);

    return this.prisma.historicalSale.update({
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
  }
}
