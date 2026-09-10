import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { combineMarcaModelo } from '../../common/marca-modelo.util';
import { PrismaService } from '../../prisma/prisma.service';
import { VentaUpdatePlan } from './ventas.util';

export interface NewVentaData {
  fecha: Date;
  cliente: string;
  celular: string | null;
  marca: string;
  modelo: string;
  estilo: string | null;
  precioVenta: number;
  costoProducto: number;
  costoEnvio: number;
  abono: number;
  saldoPendiente: number;
  gananciaNeta: number;
  fuente: string | null;
  estado: string;
}

@Injectable()
export class VentasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const venta = await this.prisma.historicalSale.findUnique({
      where: { id },
    });
    if (!venta) throw new NotFoundException(`Venta ${id} no encontrada`);
    return venta;
  }

  async create(data: NewVentaData) {
    return this.prisma.$transaction(async (tx) => {
      const nuevaVenta = await tx.historicalSale.create({
        data: {
          fecha: data.fecha,
          cliente: data.cliente,
          celular: data.celular,
          marca: data.marca,
          modelo: data.modelo,
          estilo: data.estilo,
          precioVenta: data.precioVenta,
          costoProducto: data.costoProducto,
          costoEnvio: data.costoEnvio,
          abono: data.abono,
          saldoPendiente: data.saldoPendiente,
          gananciaNeta: data.gananciaNeta,
          fuente: data.fuente,
          estado: data.estado,
        },
      });

      // Buscar el inventario primero, case-insensitive (igual que orders) —
      // si el modelo no está rastreado en inventario maestro, no se toca stock.
      const inv = await tx.inventarioMaestro.findFirst({
        where: { modelo: { equals: data.modelo, mode: 'insensitive' } },
      });

      if (inv) {
        // Decremento atómico con piso en cero: la condición stock >= 1 se
        // evalúa en el mismo UPDATE, así que nunca queda stock negativo.
        const { count } = await tx.inventarioMaestro.updateMany({
          where: { id: inv.id, stock: { gte: 1 } },
          data: { stock: { decrement: 1 } },
        });
        if (count === 0) {
          throw new BadRequestException(
            `Stock insuficiente para "${combineMarcaModelo(data.marca, data.modelo)}".`,
          );
        }

        // Si el stock llega a 0, deshabilitar todas las variantes de este modelo (mismo nombre)
        const invActualizado = await tx.inventarioMaestro.findUniqueOrThrow({
          where: { id: inv.id },
        });
        if (invActualizado.stock <= 0) {
          const nombreCompleto = combineMarcaModelo(data.marca, data.modelo);
          await tx.product.updateMany({
            where: {
              nombre: { equals: nombreCompleto, mode: 'insensitive' },
              disponible: true,
            },
            data: { disponible: false },
          });
        }
      }

      return nuevaVenta;
    });
  }

  update(id: string, plan: VentaUpdatePlan) {
    return this.prisma.historicalSale.update({
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

  async remove(id: string, existing: { marca: string | null; modelo: string }) {
    await this.prisma.$transaction(async (tx) => {
      await tx.historicalSale.delete({ where: { id } });

      // Revertir el descuento de inventario que se aplicó al registrar la venta
      await tx.inventarioMaestro.updateMany({
        where: { modelo: existing.modelo },
        data: { stock: { increment: 1 } },
      });

      // Si el stock vuelve a ser positivo, re-habilitar las variantes de este modelo
      const inv = await tx.inventarioMaestro.findUnique({
        where: { modelo: existing.modelo },
      });
      if (inv && inv.stock > 0) {
        const nombreCompleto = combineMarcaModelo(
          existing.marca,
          existing.modelo,
        );
        await tx.product.updateMany({
          where: {
            nombre: { equals: nombreCompleto, mode: 'insensitive' },
            disponible: false,
          },
          data: { disponible: true },
        });
      }
    });
  }
}
