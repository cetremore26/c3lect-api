import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { calcGananciaPorVenta } from '../metrics/metrics.service';
import { CreateVentaDto } from './dto/create-venta.dto';

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
}
