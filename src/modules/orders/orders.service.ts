import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoPedido } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';

const VALID_TRANSITIONS: Record<EstadoPedido, EstadoPedido[]> = {
  PENDIENTE:  [EstadoPedido.CONFIRMADO, EstadoPedido.CANCELADO],
  CONFIRMADO: [EstadoPedido.EN_CAMINO,  EstadoPedido.CANCELADO],
  EN_CAMINO:  [EstadoPedido.ENTREGADO,  EstadoPedido.CANCELADO],
  ENTREGADO:  [],
  CANCELADO:  [],
};

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function randomSuffix(len: number): string {
  return Array.from(randomBytes(len))
    .map((b) => ALPHA[b % ALPHA.length])
    .join('');
}

function buildOrderNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `C3L-${y}${m}${d}-${randomSuffix(5)}`;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async createOrder(dto: CreateOrderDto, userId?: string) {
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, disponible: true },
    });

    if (products.length !== productIds.length) {
      const found = new Set(products.map((p) => p.id));
      const missing = productIds.filter((id) => !found.has(id));
      throw new BadRequestException(
        `Producto(s) no disponible(s): ${missing.join(', ')}`,
      );
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    const itemsData = dto.items.map((item) => {
      const product = productMap.get(item.productId)!;
      return {
        productId: item.productId,
        nombre: product.nombre,
        precioUnitario: product.precio,
        cantidad: item.cantidad,
        subtotal: product.precio * item.cantidad,
      };
    });

    const subtotal = itemsData.reduce((sum, i) => sum + i.subtotal, 0);
    const total = subtotal;
    const orderNumber = buildOrderNumber();

    const order = await this.prisma.$transaction(async (tx) => {
      return tx.order.create({
        data: {
          orderNumber,
          userId: userId ?? null,
          subtotal,
          total,
          paymentMethod: dto.metodoPago,
          items: { create: itemsData },
          shippingInfo: { create: dto.shippingInfo },
          statusHistory: {
            create: {
              statusNuevo: EstadoPedido.PENDIENTE,
              changedBy: userId ?? null,
            },
          },
        },
        include: {
          items: true,
          shippingInfo: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    const nombreCliente = dto.shippingInfo.nombreCompleto;

    void this.mail.sendOrderConfirmation(
      dto.shippingInfo.email,
      nombreCliente,
      order.orderNumber,
      order.items,
      order.total,
    );

    const adminEmail = this.config.get<string>('ADMIN_EMAIL');
    if (adminEmail) {
      void this.mail.sendNewOrderAdmin(adminEmail, order.orderNumber, nombreCliente, order.total, order.items);
    }

    return order;
  }

  async findAll(query: QueryOrdersDto, userId?: string, rol?: string) {
    const { status, fechaDesde, fechaHasta, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (rol !== 'ADMIN') {
      // Clientes solo ven sus propios pedidos
      where.userId = userId;
    }

    if (status) where.status = status;

    if (fechaDesde || fechaHasta) {
      where.createdAt = {
        ...(fechaDesde ? { gte: new Date(fechaDesde) } : {}),
        ...(fechaHasta ? { lte: new Date(fechaHasta + 'T23:59:59Z') } : {}),
      };
    }

    if (search && rol === 'ADMIN') {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { shippingInfo: { email: { contains: search, mode: 'insensitive' } } },
        { shippingInfo: { nombreCompleto: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: true,
          shippingInfo: true,
          user: { select: { id: true, email: true, nombre: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, userId?: string, rol?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        shippingInfo: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        user: { select: { id: true, email: true, nombre: true } },
      },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado.');

    if (rol !== 'ADMIN' && order.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para ver este pedido.');
    }

    return order;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, adminId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { shippingInfo: true, user: true, items: true },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado.');

    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `No se puede cambiar de ${order.status} a ${dto.status}.`,
      );
    }

    // El stock solo se descuenta al confirmar (PENDIENTE→CONFIRMADO) y solo se
    // restablece si se cancela un pedido que ya lo había descontado (es decir,
    // que pasó por CONFIRMADO). Cancelar desde PENDIENTE nunca tocó el stock.
    const seConfirma = order.status === EstadoPedido.PENDIENTE && dto.status === EstadoPedido.CONFIRMADO;
    const seCancelaConStockDescontado =
      dto.status === EstadoPedido.CANCELADO && order.status !== EstadoPedido.PENDIENTE;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { status: dto.status },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          statusAnterior: order.status,
          statusNuevo: dto.status,
          changedBy: adminId,
        },
      });

      if (seConfirma || seCancelaConStockDescontado) {
        const signo = seConfirma ? -1 : 1;
        for (const item of order.items) {
          const inv = await tx.inventarioMaestro.findFirst({
            where: { modelo: { equals: item.nombre, mode: 'insensitive' } },
          });
          if (!inv) continue; // producto no rastreado en inventario maestro

          if (signo < 0 && inv.stock < item.cantidad) {
            throw new BadRequestException(
              `Stock insuficiente para "${item.nombre}" (disponible: ${inv.stock}, solicitado: ${item.cantidad}).`,
            );
          }

          const nuevoStock = Math.max(0, inv.stock + signo * item.cantidad);
          await tx.inventarioMaestro.update({
            where: { id: inv.id },
            data: { stock: nuevoStock },
          });
          await tx.product.updateMany({
            where: { nombre: { equals: item.nombre, mode: 'insensitive' } },
            data: { disponible: nuevoStock > 0 },
          });
        }
      }
    });

    const email = order.shippingInfo?.email;
    const nombre = order.shippingInfo?.nombreCompleto ?? order.user?.nombre ?? 'Cliente';
    if (email) {
      void this.mail.sendOrderStatusUpdate(email, nombre, order.orderNumber, dto.status);
    }

    void this.audit.log(
      'ESTADO', 'pedido', id,
      `Pedido ${order.orderNumber}: ${order.status} → ${dto.status}`,
      adminId,
    );

    return { message: `Pedido actualizado a ${dto.status}.` };
  }

  async linkGuestOrders(email: string, userId: string): Promise<void> {
    await this.prisma.order.updateMany({
      where: { userId: null, shippingInfo: { email } },
      data: { userId },
    });
  }
}
