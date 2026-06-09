import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface OrderEmailItem {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

@Injectable()
export class MailService {
  private readonly resend: Resend;
  private readonly from: string;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(config.get<string>('RESEND_API_KEY'));
    this.from = config.get<string>('RESEND_FROM') ?? 'C3LECT <onboarding@resend.dev>';
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  async sendOtp(email: string, code: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email,
      subject: 'Tu código de acceso C3LECT',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#111;margin-bottom:8px">Tu código de acceso</h2>
          <p style="color:#555;margin-bottom:24px">Usa este código para iniciar sesión en C3LECT. Expira en <strong>10 minutos</strong>.</p>
          <div style="background:#f4f4f5;border-radius:8px;padding:24px;text-align:center;letter-spacing:12px;font-size:36px;font-weight:700;color:#111">
            ${code}
          </div>
          <p style="color:#888;font-size:13px;margin-top:24px">Si no solicitaste este código, ignora este correo.</p>
        </div>
      `,
    });
    if (error) this.logger.error('sendOtp error', error);
  }

  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email,
      subject: 'Restablecer contraseña C3LECT',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#111;margin-bottom:8px">Restablecer contraseña</h2>
          <p style="color:#555;margin-bottom:24px">Haz clic en el botón para crear una nueva contraseña. Este enlace expira en <strong>15 minutos</strong>.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">
            Cambiar contraseña
          </a>
          <p style="color:#888;font-size:13px;margin-top:24px">Si no solicitaste este cambio, ignora este correo.</p>
        </div>
      `,
    });
    if (error) this.logger.error('sendPasswordReset error', error);
  }

  async sendWelcome(email: string, nombre: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email,
      subject: 'Bienvenido a C3LECT',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#111;margin-bottom:8px">Bienvenido, ${nombre}</h2>
          <p style="color:#555">Tu cuenta en C3LECT ha sido creada exitosamente.</p>
          <p style="color:#555">Explora nuestra colección de relojería y perfumería de lujo.</p>
        </div>
      `,
    });
    if (error) this.logger.error('sendWelcome error', error);
  }

  // ─── Orders ────────────────────────────────────────────────────────────────

  async sendOrderConfirmation(
    email: string,
    nombre: string,
    orderNumber: string,
    items: OrderEmailItem[],
    total: number,
  ): Promise<void> {
    const itemsHtml = items
      .map(
        (i) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee">${i.nombre}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">${i.cantidad}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">$${i.precioUnitario.toLocaleString('es-CO')}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">$${i.subtotal.toLocaleString('es-CO')}</td>
        </tr>`,
      )
      .join('');

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email,
      subject: `Pedido confirmado — C3LECT`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
          <h2 style="color:#111">¡Pedido confirmado, ${nombre}!</h2>
          <p style="color:#555">Tu número de pedido es <strong>#${orderNumber}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0">
            <thead>
              <tr style="background:#f4f4f5">
                <th style="padding:8px;text-align:left">Producto</th>
                <th style="padding:8px;text-align:center">Cant.</th>
                <th style="padding:8px;text-align:right">Precio</th>
                <th style="padding:8px;text-align:right">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <p style="text-align:right;font-size:18px;font-weight:700">Total: $${total.toLocaleString('es-CO')}</p>
        </div>
      `,
    });
    if (error) this.logger.error('sendOrderConfirmation error', error);
  }

  async sendOrderStatusUpdate(
    email: string,
    nombre: string,
    orderNumber: string,
    nuevoStatus: string,
  ): Promise<void> {
    const statusLabels: Record<string, string> = {
      PENDIENTE:  'Pendiente de confirmación',
      CONFIRMADO: 'Pago confirmado — preparando envío',
      EN_CAMINO:  'En camino a tu dirección',
      ENTREGADO:  'Entregado',
      CANCELADO:  'Cancelado',
    };
    const label = statusLabels[nuevoStatus] ?? nuevoStatus;

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email,
      subject: `Actualización de tu pedido C3LECT`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#111">Actualización de pedido</h2>
          <p style="color:#555">Hola ${nombre}, tu pedido <strong>#${orderNumber}</strong> ha cambiado de estado.</p>
          <div style="background:#f4f4f5;border-radius:8px;padding:16px;margin-top:16px;font-weight:600;color:#111">
            ${label}
          </div>
        </div>
      `,
    });
    if (error) this.logger.error('sendOrderStatusUpdate error', error);
  }

  async sendNewOrderAdmin(
    adminEmail: string,
    orderNumber: string,
    clienteNombre: string,
    total: number,
    items: OrderEmailItem[],
  ): Promise<void> {
    const itemsHtml = items
      .map(
        (i) => `
        <tr>
          <td style="padding:8px 4px;border-bottom:1px solid #eee">${i.nombre}</td>
          <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:center">${i.cantidad}</td>
          <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:right">$${i.precioUnitario.toLocaleString('es-CO')}</td>
          <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:right">$${i.subtotal.toLocaleString('es-CO')}</td>
        </tr>`,
      )
      .join('');

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: adminEmail,
      subject: `Nuevo pedido #${orderNumber} — C3LECT`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
          <h2 style="color:#111">Nuevo pedido recibido</h2>
          <p style="color:#555">Cliente: <strong>${clienteNombre}</strong></p>
          <p style="color:#555">Número: <strong>#${orderNumber}</strong></p>
          <table style="width:100%;border-collapse:collapse;margin:24px 0">
            <thead>
              <tr style="background:#f4f4f5">
                <th style="padding:8px 4px;text-align:left">Producto</th>
                <th style="padding:8px 4px;text-align:center">Cant.</th>
                <th style="padding:8px 4px;text-align:right">Precio unit.</th>
                <th style="padding:8px 4px;text-align:right">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <p style="text-align:right;font-size:18px;font-weight:700;color:#111">Total: $${total.toLocaleString('es-CO')}</p>
        </div>
      `,
    });
    if (error) this.logger.error('sendNewOrderAdmin error', error);
  }
}
