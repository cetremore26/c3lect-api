import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import {
  NuevaVenta,
  Venta,
  VentasRepositoryPort,
} from '../../application/ports/ventas-repository.port';
import { VentaUpdatePlan } from '../../domain/ventas.util';

@Injectable()
export class VentasRepository implements VentasRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  findById(id: string): Promise<Venta | null> {
    return this.db.client.historicalSale.findUnique({ where: { id } });
  }

  create(data: NuevaVenta): Promise<Venta> {
    return this.db.client.historicalSale.create({ data });
  }

  async createMany(data: NuevaVenta[]): Promise<void> {
    if (data.length === 0) return;
    await this.db.client.historicalSale.createMany({ data });
  }

  update(id: string, plan: VentaUpdatePlan): Promise<Venta> {
    return this.db.client.historicalSale.update({
      where: { id },
      data: {
        fecha: plan.fecha,
        cliente: plan.cliente,
        celular: plan.celular,
        marca: plan.marca,
        modelo: plan.modelo,
        estilo: plan.estilo,
        fuente: plan.fuente,
        precioVenta: plan.precioVenta,
        costoProducto: plan.costoProducto,
        costoEnvio: plan.costoEnvio,
        abono: plan.abono,
        saldoPendiente: plan.saldoPendiente,
        gananciaNeta: plan.gananciaNeta,
        estado: plan.estado,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.db.client.historicalSale.delete({ where: { id } });
  }

  async removeByOrderId(orderId: string): Promise<void> {
    await this.db.client.historicalSale.deleteMany({ where: { orderId } });
  }

  modelosVendidos(): Promise<{ modelo: string }[]> {
    return this.db.client.historicalSale.findMany({ select: { modelo: true } });
  }
}
