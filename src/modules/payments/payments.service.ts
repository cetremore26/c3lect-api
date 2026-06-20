import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstadoPago, EstadoPedido, Payment } from '@prisma/client';
import { createHmac } from 'crypto';
import { MercadoPagoConfig, Preference, Payment as MpPayment } from 'mercadopago';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { OrdersService, buildOrderNumber } from '../orders/orders.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreatePendingPaymentDto } from './dto/create-pending-payment.dto';
import { WebhookPaymentDto } from './dto/webhook-payment.dto';

interface DraftPayload {
  itemsData: { productId: string; nombre: string; precioUnitario: number; cantidad: number; subtotal: number }[];
  subtotal: number;
  total: number;
  shippingInfo: { nombreCompleto: string; email: string; telefono: string; ciudad: string; departamento: string; direccion: string; notas?: string };
  userId: string | null;
}

// Removes diacritics so standard PDF fonts (WinAnsi) render all chars correctly
function pdfSafe(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function formatCOP(amount: number): string {
  return '$' + amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const MP_STATUS_MAP: Record<string, EstadoPago> = {
  approved:   EstadoPago.APROBADO,
  rejected:   EstadoPago.RECHAZADO,
  pending:    EstadoPago.PENDIENTE,
  in_process: EstadoPago.PENDIENTE,
  cancelled:  EstadoPago.CANCELADO,
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly ordersService: OrdersService,
  ) {}

  // ─── Create payment preference ───────────────────────────────────────────────

  async createPayment(dto: CreatePaymentDto, userId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { items: true, shippingInfo: true },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    if (order.status !== EstadoPedido.PENDIENTE) {
      throw new BadRequestException(
        `El pedido está en estado ${order.status} y no puede procesarse.',`,
      );
    }

    const accessToken = this.config.getOrThrow<string>('MP_ACCESS_TOKEN');
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const apiUrl = this.config.getOrThrow<string>('API_URL');

    const mpClient = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(mpClient);

    const prefResult = await preference.create({
      body: {
        items: order.items.map((item) => ({
          id: item.productId,
          title: item.nombre,
          quantity: item.cantidad,
          unit_price: item.precioUnitario,
          currency_id: 'COP',
        })),
        payer: {
          email: order.shippingInfo?.email ?? 'cliente@c3lect.com',
        },
        external_reference: order.orderNumber,
        back_urls: {
          success: `${frontendUrl}/checkout/success`,
          failure: `${frontendUrl}/checkout/failure`,
          pending: `${frontendUrl}/checkout/pending`,
        },
        notification_url: `${apiUrl}/payments/webhook`,
        statement_descriptor: 'C3LECT',
      },
    });

    const checkoutUrl = prefResult.sandbox_init_point ?? prefResult.init_point ?? '';

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: userId ?? null,
        estado: EstadoPago.PENDIENTE,
        preferenceId: prefResult.id ?? null,
        checkoutUrl,
        total: order.total,
      },
    });

    return {
      checkoutUrl,
      preferenceId: prefResult.id,
      paymentId: payment.id,
    };
  }

  // ─── Create payment preference SIN crear el pedido todavía ───────────────────
  // El pedido solo se materializa cuando el webhook confirma el pago aprobado
  // (ver handleApproved). Así un pago abandonado/rechazado/fallido en MercadoPago
  // nunca deja un pedido huérfano en PENDIENTE.

  async createPendingOrderPayment(dto: CreatePendingPaymentDto, userId?: string) {
    const { itemsData, subtotal, total } = await this.ordersService.resolveItems(dto.items);
    const orderNumber = buildOrderNumber();

    const accessToken = this.config.getOrThrow<string>('MP_ACCESS_TOKEN');
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const apiUrl = this.config.getOrThrow<string>('API_URL');

    const mpClient = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(mpClient);

    const prefResult = await preference.create({
      body: {
        items: itemsData.map((item) => ({
          id: item.productId,
          title: item.nombre,
          quantity: item.cantidad,
          unit_price: item.precioUnitario,
          currency_id: 'COP',
        })),
        payer: {
          email: dto.shippingInfo.email,
        },
        external_reference: orderNumber,
        back_urls: {
          success: `${frontendUrl}/checkout/success`,
          failure: `${frontendUrl}/checkout/failure`,
          pending: `${frontendUrl}/checkout/pending`,
        },
        notification_url: `${apiUrl}/payments/webhook`,
        statement_descriptor: 'C3LECT',
      },
    });

    const checkoutUrl = prefResult.sandbox_init_point ?? prefResult.init_point ?? '';

    const draftPayload: DraftPayload = {
      itemsData,
      subtotal,
      total,
      shippingInfo: dto.shippingInfo,
      userId: userId ?? null,
    };

    const payment = await this.prisma.payment.create({
      data: {
        orderId: null,
        orderNumber,
        userId: userId ?? null,
        estado: EstadoPago.PENDIENTE,
        preferenceId: prefResult.id ?? null,
        checkoutUrl,
        total,
        draftPayload: draftPayload as unknown as object,
      },
    });

    return {
      checkoutUrl,
      preferenceId: prefResult.id,
      paymentId: payment.id,
    };
  }

  // ─── Handle MP webhook ────────────────────────────────────────────────────────

  async handleWebhook(
    dto: WebhookPaymentDto,
    xSignature?: string,
    xRequestId?: string,
  ): Promise<void> {
    if (dto.type !== 'payment') return;

    if (xSignature && xRequestId) {
      const valid = this.verifySignature(dto.data.id, xSignature, xRequestId);
      if (!valid) {
        this.logger.warn(`Webhook signature invalid for payment ${dto.data.id}`);
        return;
      }
    }

    try {
      const accessToken = this.config.getOrThrow<string>('MP_ACCESS_TOKEN');
      const mpClient = new MercadoPagoConfig({ accessToken });
      const mpPaymentClient = new MpPayment(mpClient);

      const mpPayment = await mpPaymentClient.get({ id: dto.data.id });
      const orderNumber = mpPayment.external_reference;
      const nuevoEstado = MP_STATUS_MAP[mpPayment.status ?? ''] ?? EstadoPago.PENDIENTE;

      if (!orderNumber) {
        this.logger.warn(`Webhook payment ${dto.data.id} has no external_reference`);
        return;
      }

      const existingPayment = await this.prisma.payment.findFirst({
        where: { orderNumber },
        orderBy: { createdAt: 'desc' },
      });
      if (!existingPayment) {
        this.logger.warn(`No payment record found for order ${orderNumber}`);
        return;
      }

      // Actualización condicional atómica: MercadoPago reintenta la entrega
      // del webhook, así que dos entregas casi simultáneas podrían leer el
      // mismo estado "no terminal" y ambas intentar procesar el pago. Solo
      // la entrega que efectivamente cambia el estado (count===1) continúa;
      // si otra ya lo dejó en estado terminal, count=0 y no hacemos nada más
      // — evita crear dos pedidos para un solo pago.
      const { count } = await this.prisma.payment.updateMany({
        where: {
          id: existingPayment.id,
          estado: { notIn: [EstadoPago.APROBADO, EstadoPago.RECHAZADO, EstadoPago.CANCELADO] },
        },
        data: { estado: nuevoEstado, mpPaymentId: String(dto.data.id) },
      });
      if (count === 0) return; // ya procesado por otra entrega del webhook

      if (nuevoEstado === EstadoPago.APROBADO) {
        await this.handleApproved(orderNumber, existingPayment);
      } else if (
        nuevoEstado === EstadoPago.RECHAZADO ||
        nuevoEstado === EstadoPago.CANCELADO
      ) {
        await this.handleRejected(orderNumber, existingPayment);
      }
    } catch (err) {
      this.logger.error('Error processing webhook', err);
    }
  }

  // ─── Get payment by orderId ───────────────────────────────────────────────────

  async getByOrderId(orderId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) throw new NotFoundException('No hay registro de pago para este pedido.');
    return payment;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async handleApproved(orderNumber: string, payment: Payment): Promise<void> {
    let order: { id: string; orderNumber: string; total: number; shippingInfo: { email: string; nombreCompleto: string } | null; items: { nombre: string; cantidad: number; precioUnitario: number; subtotal: number }[] };

    if (payment.orderId) {
      // Compatibilidad con el flujo viejo (POST /payments/create sobre un
      // pedido que ya existía como PENDIENTE) — ya no lo usa el frontend,
      // pero se deja vivo por si se genera un link de pago para un pedido
      // existente en el futuro.
      const existing = await this.prisma.order.findUnique({
        where: { id: payment.orderId },
        include: { items: true, shippingInfo: true },
      });
      if (!existing || existing.status !== EstadoPedido.PENDIENTE) return;

      try {
        // skipStatusEmail=true: ya enviamos un comprobante con PDF más abajo.
        await this.ordersService.updateStatus(
          existing.id,
          { status: EstadoPedido.CONFIRMADO },
          'MERCADOPAGO',
          true,
        );
      } catch (err) {
        this.logger.error(`Pago aprobado pero no se pudo confirmar el pedido ${orderNumber}`, err);
        const adminEmail = this.config.get<string>('ADMIN_EMAIL');
        if (adminEmail) {
          const detalle = err instanceof Error ? err.message : String(err);
          void this.mail.sendStockAlert(adminEmail, orderNumber, detalle);
        }
        return;
      }
      order = existing;
    } else {
      // Flujo nuevo: el pedido no existía todavía. Se crea ya CONFIRMADO,
      // con el mismo descuento de stock + creación de ventas que cualquier
      // otra confirmación, a partir de los datos congelados en draftPayload.
      const draft = payment.draftPayload as unknown as DraftPayload | null;
      if (!draft) {
        this.logger.error(`Payment ${payment.id} aprobado sin draftPayload — no se puede crear el pedido`);
        return;
      }

      try {
        const created = await this.ordersService.createConfirmedOrder({
          orderNumber,
          itemsData: draft.itemsData,
          subtotal: draft.subtotal,
          total: draft.total,
          shippingInfo: draft.shippingInfo,
          userId: draft.userId,
        });
        order = created;
      } catch (err) {
        // El dinero ya lo cobró MercadoPago — no podemos revertir eso. Si
        // falló por falta de stock, no queda ningún pedido creado y un admin
        // debe resolverlo manualmente (reabastecer y crear el pedido a mano,
        // o reembolsar).
        this.logger.error(`Pago aprobado pero no se pudo crear el pedido ${orderNumber}`, err);
        const adminEmail = this.config.get<string>('ADMIN_EMAIL');
        if (adminEmail) {
          const detalle = err instanceof Error ? err.message : String(err);
          void this.mail.sendStockAlert(adminEmail, orderNumber, detalle);
        }
        return;
      }

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { orderId: order.id },
      });
    }

    const pdfBuffer = await this.generateVoucher(order);

    if (order.shippingInfo) {
      void this.mail.sendPaymentConfirmation(
        order.shippingInfo.email,
        order.shippingInfo.nombreCompleto,
        order.orderNumber,
        order.total,
        pdfBuffer,
      );
    }

    const adminEmail = this.config.get<string>('ADMIN_EMAIL');
    if (adminEmail) {
      void this.mail.sendPaymentConfirmation(
        adminEmail,
        'Admin',
        order.orderNumber,
        order.total,
        pdfBuffer,
      );
    }
  }

  private async handleRejected(orderNumber: string, payment: Payment): Promise<void> {
    if (!payment.orderId) {
      // Flujo nuevo: nunca existió un pedido — no hay nada que cancelar.
      // El Payment ya quedó marcado RECHAZADO/CANCELADO antes de llegar aquí.
      return;
    }

    // Compatibilidad con el flujo viejo: el pedido ya existía como PENDIENTE.
    const order = await this.prisma.order.findUnique({ where: { id: payment.orderId } });
    if (!order || order.status !== EstadoPedido.PENDIENTE) return;

    await this.ordersService.updateStatus(
      order.id,
      { status: EstadoPedido.CANCELADO },
      'MERCADOPAGO',
    );
  }

  private verifySignature(
    dataId: string,
    xSignature: string,
    xRequestId: string,
  ): boolean {
    const secret = this.config.get<string>('MP_WEBHOOK_SECRET');
    if (!secret) return true;

    try {
      const parts: Record<string, string> = {};
      for (const part of xSignature.split(',')) {
        const [k, v] = part.split('=');
        if (k && v) parts[k.trim()] = v.trim();
      }
      const { ts, v1 } = parts;
      if (!ts || !v1) return false;

      const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
      const expected = createHmac('sha256', secret).update(manifest).digest('hex');
      return expected === v1;
    } catch {
      return false;
    }
  }

  private async generateVoucher(order: {
    orderNumber: string;
    total: number;
    items: { nombre: string; cantidad: number; precioUnitario: number; subtotal: number }[];
  }): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width } = page.getSize();
    const gold = rgb(0.83, 0.69, 0.22);
    const dark = rgb(0.1, 0.1, 0.1);
    const gray = rgb(0.4, 0.4, 0.4);
    const lightGray = rgb(0.85, 0.85, 0.85);

    let y = 782;

    // Header
    page.drawText('C3LECT', { x: 50, y, size: 32, font: boldFont, color: gold });

    y -= 28;
    page.drawText('COMPROBANTE DE PAGO', { x: 50, y, size: 14, font: boldFont, color: dark });

    y -= 18;
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 1, color: lightGray });

    // Order info
    y -= 28;
    page.drawText(pdfSafe(`Numero de orden: ${order.orderNumber}`), {
      x: 50, y, size: 11, font: boldFont, color: dark,
    });

    y -= 20;
    const fecha = new Date().toLocaleDateString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    page.drawText(pdfSafe(`Fecha de pago: ${fecha}`), {
      x: 50, y, size: 11, font, color: gray,
    });

    // Products table header
    y -= 38;
    page.drawRectangle({
      x: 50, y: y - 6, width: width - 100, height: 22,
      color: rgb(0.95, 0.95, 0.95),
    });
    page.drawText('Producto', { x: 56, y, size: 10, font: boldFont, color: dark });
    page.drawText('Cant.', { x: 355, y, size: 10, font: boldFont, color: dark });
    page.drawText('Precio', { x: 400, y, size: 10, font: boldFont, color: dark });
    page.drawText('Subtotal', { x: 460, y, size: 10, font: boldFont, color: dark });

    for (const item of order.items) {
      y -= 22;
      const nombre = pdfSafe(
        item.nombre.length > 42 ? item.nombre.substring(0, 39) + '...' : item.nombre,
      );
      page.drawText(nombre, { x: 56, y, size: 9, font, color: dark });
      page.drawText(String(item.cantidad), { x: 365, y, size: 9, font, color: dark });
      page.drawText(formatCOP(item.precioUnitario), { x: 395, y, size: 9, font, color: dark });
      page.drawText(formatCOP(item.subtotal), { x: 455, y, size: 9, font, color: dark });
    }

    y -= 14;
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: lightGray });

    // Total
    y -= 22;
    page.drawText('TOTAL:', { x: 400, y, size: 13, font: boldFont, color: dark });
    page.drawText(`${formatCOP(order.total)} COP`, { x: 455, y, size: 13, font: boldFont, color: gold });

    // Footer
    y -= 70;
    page.drawText(pdfSafe('Gracias por tu compra en C3LECT'), {
      x: width / 2 - 105, y, size: 12, font: boldFont, color: gray,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
