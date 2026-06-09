import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly resend: Resend;
  private readonly from: string;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(config.get<string>('RESEND_API_KEY'));
    this.from = config.get<string>('RESEND_FROM') ?? 'C3LECT <onboarding@resend.dev>';
  }

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
}
