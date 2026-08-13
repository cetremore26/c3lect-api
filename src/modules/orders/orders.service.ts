import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoPedido, MetodoPago, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { calcGananciaPorVenta } from '../metrics/metrics.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { deriveMarcaModeloFromProduct } from '../../common/marca-modelo.util';

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

export function buildOrderNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `C3L-${y}${m}${d}-${randomSuffix(5)}`;
}

interface ResolvedItem {
  productId: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  subtotal: number;
}

interface ResolvedItems {
  itemsData: ResolvedItem[];
  subtotal: number;
  total: number;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  // Resuelve precios server-side (nunca confía en lo que envía el cliente) y
  // hace una verificación best-effort de stock. El guard autoritativo sigue
  // siendo el de aplicarConfirmacion, que vuelve a revisar el stock justo
  // antes de confirmar/materializar el pedido.
  async resolveItems(items: { productId: string; cantidad: number }[]): Promise<ResolvedItems> {
    const productIds = items.map((i) => i.productId);
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
    const itemsData = items.map((item) => {
      const product = productMap.get(item.productId)!;
      return {
        productId: item.productId,
        nombre: product.nombre,
        precioUnitario: product.precio,
        cantidad: item.cantidad,
        subtotal: product.precio * item.cantidad,
      };
    });

    for (const item of itemsData) {
      const product = productMap.get(item.productId)!;
      const { modelo } = deriveMarcaModeloFromProduct(product);
      const inv = await this.findInventarioByModelo(this.prisma, modelo, product.nombre);
      if (inv && inv.stock < item.cantidad) {
        throw new BadRequestException(
          `Stock insuficiente para "${item.nombre}" (disponible: ${inv.stock}, solicitado: ${item.cantidad}).`,
        );
      }
    }

    const subtotal = itemsData.reduce((sum, i) => sum + i.subtotal, 0);
    return { itemsData, subtotal, total: subtotal };
  }

  // Busca InventarioMaestro primero por el modelo derivado de Product.marca+nombre; si la fila
  // todavía no fue migrada (marca/modelo separados), cae al comportamiento legado: modelo ===
  // el nombre completo del producto. Este fallback es lo que mantiene vivo el checkout mientras
  // dure la ventana de backfill.
  private async findInventarioByModelo(
    tx: Prisma.TransactionClient | PrismaService,
    modelo: string,
    nombreCompletoLegado: string,
  ) {
    const inv = await tx.inventarioMaestro.findFirst({
      where: { modelo: { equals: modelo, mode: 'insensitive' } },
    });
    if (inv) return inv;
    if (modelo !== nombreCompletoLegado) {
      return tx.inventarioMaestro.findFirst({
        where: { modelo: { equals: nombreCompletoLegado, mode: 'insensitive' } },
      });
    }
    return null;
  }

  async createOrder(dto: CreateOrderDto, userId?: string) {
    const { itemsData, subtotal, total } = await this.resolveItems(dto.items);
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

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    adminId: string,
    skipStatusEmail = false,
  ) {
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

    // El stock y las ventas solo se generan al confirmar (PENDIENTE→CONFIRMADO)
    // y solo se revierten si se cancela un pedido que ya los había generado
    // (es decir, que pasó por CONFIRMADO). Cancelar desde PENDIENTE nunca tocó
    // ni stock ni ventas.
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

      if (seConfirma) {
        await this.aplicarConfirmacion(
          tx,
          order.id,
          order.items,
          order.shippingInfo?.nombreCompleto ?? order.user?.nombre ?? 'Cliente',
          order.shippingInfo?.telefono,
        );
      } else if (seCancelaConStockDescontado) {
        await this.revertirConfirmacion(tx, order.id, order.items);
      }
    });

    const email = order.shippingInfo?.email;
    const nombre = order.shippingInfo?.nombreCompleto ?? order.user?.nombre ?? 'Cliente';
    if (email && !skipStatusEmail) {
      void this.mail.sendOrderStatusUpdate(email, nombre, order.orderNumber, dto.status);
    }

    // skipStatusEmail=true solo lo usa el flujo de MercadoPago para la transición
    // PENDIENTE→CONFIRMADO automática — ahí el admin ya recibe el comprobante de
    // pago (sendPaymentConfirmation), así que notificarlo aquí sería duplicado.
    const adminEmail = this.config.get<string>('ADMIN_EMAIL');
    if (adminEmail && !skipStatusEmail) {
      void this.mail.sendOrderStatusUpdateAdmin(adminEmail, order.orderNumber, dto.status, nombre);
    }

    await this.audit.log(
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

  // Crea el pedido directamente en CONFIRMADO (sin pasar por PENDIENTE) y le
  // aplica el mismo descuento de stock + creación de ventas que una
  // confirmación normal. Lo usa el flujo de MercadoPago: el pedido solo
  // existe una vez que el webhook avisa que el pago fue aprobado — nunca
  // antes — así que no tiene sentido un estado PENDIENTE intermedio.
  async createConfirmedOrder(params: {
    orderNumber: string;
    itemsData: ResolvedItem[];
    subtotal: number;
    total: number;
    shippingInfo: CreateOrderDto['shippingInfo'];
    userId?: string | null;
  }) {
    const { orderNumber, itemsData, subtotal, total, shippingInfo, userId } = params;

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          userId: userId ?? null,
          subtotal,
          total,
          paymentMethod: MetodoPago.MERCADOPAGO,
          status: EstadoPedido.CONFIRMADO,
          items: { create: itemsData },
          shippingInfo: { create: shippingInfo },
          statusHistory: {
            create: {
              statusAnterior: null,
              statusNuevo: EstadoPedido.CONFIRMADO,
              changedBy: 'MERCADOPAGO',
            },
          },
        },
        include: {
          items: true,
          shippingInfo: true,
          statusHistory: { orderBy: { createdAt: 'asc' } },
        },
      });

      await this.aplicarConfirmacion(
        tx,
        created.id,
        created.items,
        shippingInfo.nombreCompleto,
        shippingInfo.telefono,
      );

      return created;
    });

    await this.audit.log(
      'ESTADO', 'pedido', order.id,
      `Pedido ${order.orderNumber}: creado y confirmado vía MercadoPago`,
      'MERCADOPAGO',
    );

    return order;
  }

  // Descuenta stock y crea una fila de venta por unidad (fuente "Plataforma"),
  // igual que el registro manual. Se asume pago completo: o ya aprobó
  // MercadoPago, o el admin confirma a mano tras cobrar contra entrega.
  private async aplicarConfirmacion(
    tx: Prisma.TransactionClient,
    orderId: string,
    items: { productId: string; nombre: string; cantidad: number; precioUnitario: number }[],
    cliente: string,
    celular: string | null | undefined,
  ): Promise<void> {
    const productos = await tx.product.findMany({
      where: { id: { in: items.map((i) => i.productId) } },
    });
    const productMap = new Map(productos.map((p) => [p.id, p]));

    for (const item of items) {
      const product = productMap.get(item.productId);
      const { marca, modelo } = product
        ? deriveMarcaModeloFromProduct(product)
        : { marca: null, modelo: item.nombre };

      const inv = await this.findInventarioByModelo(tx, modelo, item.nombre);
      if (!inv) continue; // producto no rastreado en inventario maestro

      // Decremento atómico: la condición stock >= cantidad se evalúa y aplica
      // en el mismo UPDATE (Postgres bloquea la fila y re-evalúa el WHERE al
      // ejecutarse), así que dos confirmaciones concurrentes del mismo modelo
      // no pueden partir ambas del mismo stock "viejo" y sobre-vender la
      // última unidad.
      const { count } = await tx.inventarioMaestro.updateMany({
        where: { id: inv.id, stock: { gte: item.cantidad } },
        data: { stock: { decrement: item.cantidad } },
      });
      if (count === 0) {
        throw new BadRequestException(
          `Stock insuficiente para "${item.nombre}" (disponible: ${inv.stock}, solicitado: ${item.cantidad}).`,
        );
      }

      const invActualizado = await tx.inventarioMaestro.findUniqueOrThrow({ where: { id: inv.id } });
      await tx.product.updateMany({
        where: { nombre: { equals: item.nombre, mode: 'insensitive' } },
        data: { disponible: invActualizado.stock > 0 },
      });

      const gananciaNeta = calcGananciaPorVenta(
        'Pagado', item.precioUnitario, inv.costoUnitario, 0, item.precioUnitario,
      );
      await tx.historicalSale.createMany({
        data: Array.from({ length: item.cantidad }, () => ({
          orderId,
          fecha: new Date(),
          cliente,
          celular: celular ?? null,
          marca,
          modelo,
          precioVenta: item.precioUnitario,
          costoProducto: inv.costoUnitario,
          costoEnvio: 0,
          abono: item.precioUnitario,
          saldoPendiente: 0,
          gananciaNeta,
          fuente: 'Plataforma',
          estado: 'Pagado',
        })),
      });
    }
  }

  private async revertirConfirmacion(
    tx: Prisma.TransactionClient,
    orderId: string,
    items: { productId: string; nombre: string; cantidad: number }[],
  ): Promise<void> {
    await tx.historicalSale.deleteMany({ where: { orderId } });

    const productos = await tx.product.findMany({
      where: { id: { in: items.map((i) => i.productId) } },
    });
    const productMap = new Map(productos.map((p) => [p.id, p]));

    for (const item of items) {
      const product = productMap.get(item.productId);
      const modelo = product ? deriveMarcaModeloFromProduct(product).modelo : item.nombre;

      const inv = await this.findInventarioByModelo(tx, modelo, item.nombre);
      if (!inv) continue;

      const nuevoStock = inv.stock + item.cantidad;
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
}
