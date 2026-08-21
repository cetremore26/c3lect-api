import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { calcGananciaPorVenta } from '../metrics/metrics.service';
import { CreateVentaDto } from './dto/create-venta.dto';
import { UpdateVentaDto } from './dto/update-venta.dto';
import { combineMarcaModelo } from '../../common/marca-modelo.util';
import { MetaConversionsService } from '../meta-conversions/meta-conversions.service';

@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly metaConversions: MetaConversionsService,
  ) {}

  async create(dto: CreateVentaDto, userId?: string) {
    const saldoPendiente =
      dto.precioVenta > 0 ? Math.max(0, dto.precioVenta - dto.abono) : 0;
    const gananciaNeta = calcGananciaPorVenta(
      dto.estado,
      dto.precioVenta,
      dto.costoProducto,
      dto.costoEnvio,
      dto.abono,
    );

    const venta = await this.prisma.$transaction(async (tx) => {
      const nuevaVenta = await tx.historicalSale.create({
        data: {
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
        },
      });

      // Buscar el inventario primero, case-insensitive (igual que orders.service.ts)
      // — si el modelo no está rastreado en inventario maestro, no se toca stock.
      const inv = await tx.inventarioMaestro.findFirst({
        where: { modelo: { equals: dto.modelo, mode: 'insensitive' } },
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
            `Stock insuficiente para "${combineMarcaModelo(dto.marca, dto.modelo)}".`,
          );
        }

        // Si el stock llega a 0, deshabilitar todas las variantes de este modelo (mismo nombre)
        const invActualizado = await tx.inventarioMaestro.findUniqueOrThrow({
          where: { id: inv.id },
        });
        if (invActualizado.stock <= 0) {
          const nombreCompleto = combineMarcaModelo(dto.marca, dto.modelo);
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

    await this.audit.log(
      'CREAR',
      'venta',
      venta.id,
      `Nueva venta: ${combineMarcaModelo(dto.marca, dto.modelo)} — ${dto.cliente} (${dto.estado})`,
      userId,
    );

    // Devolverle a Meta la señal de las ventas que se cierran por chat.
    // Sin esto, Meta solo ve las compras del checkout web —una fracción del
    // negocio— y termina optimizando las campañas hacia el público equivocado.
    //
    // Condiciones: que venga de un canal digital que la pauta pueda influir,
    // que haya celular para identificar al cliente, y que sea una venta real
    // (precioVenta > 0 excluye "Uso Personal").
    const canalesDigitales = ['WhatsApp', 'Instagram'];
    if (
      dto.fuente &&
      canalesDigitales.includes(dto.fuente) &&
      dto.celular &&
      dto.precioVenta > 0
    ) {
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
    const existing = await this.prisma.historicalSale.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Venta ${id} no encontrada`);

    const precioVenta = dto.precioVenta ?? existing.precioVenta;
    const costoProducto = dto.costoProducto ?? existing.costoProducto;
    const costoEnvio = dto.costoEnvio ?? existing.costoEnvio;
    const abono = dto.abono ?? existing.abono;

    let estado = dto.estado ?? existing.estado;
    if (precioVenta > 0 && abono >= precioVenta) {
      estado = 'Pagado';
    }

    const saldoPendiente =
      precioVenta > 0 ? Math.max(0, precioVenta - abono) : 0;
    const gananciaNeta = calcGananciaPorVenta(
      estado,
      precioVenta,
      costoProducto,
      costoEnvio,
      abono,
    );

    const venta = await this.prisma.historicalSale.update({
      where: { id },
      data: {
        fecha: dto.fecha ? new Date(dto.fecha) : existing.fecha,
        cliente: dto.cliente ?? existing.cliente,
        celular: dto.celular !== undefined ? dto.celular : existing.celular,
        marca: dto.marca ?? existing.marca,
        modelo: dto.modelo ?? existing.modelo,
        estilo: dto.estilo !== undefined ? dto.estilo : existing.estilo,
        fuente: dto.fuente !== undefined ? dto.fuente : existing.fuente,
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
      'EDITAR',
      'venta',
      id,
      `Venta editada: ${venta.modelo} — ${venta.cliente} | Abono: ${abono} | Estado: ${estado}`,
      userId,
    );

    return venta;
  }

  async remove(id: string, userId?: string) {
    const existing = await this.prisma.historicalSale.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Venta ${id} no encontrada`);

    // TODO: si existing.orderId está presente, esta venta fue generada por
    // OrdersService.updateStatus() al confirmar un pedido de la plataforma.
    // Borrarla aquí manualmente revierte el stock OTRA VEZ, independiente de
    // lo que ya hizo OrdersService — puede descontar el stock dos veces si el
    // pedido también se cancela/elimina después. Falta decidir si se bloquea
    // este endpoint para ventas con orderId, o se redirige al flujo de pedidos.
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
