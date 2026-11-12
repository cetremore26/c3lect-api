import { Inject, Injectable } from '@nestjs/common';
import { ADMIN_CONTACT, MAILER } from './ports/mailer.port';
import { VOUCHER_GENERATOR } from './ports/voucher-generator.port';
import type { VoucherGeneratorPort } from './ports/voucher-generator.port';
import type {
  AdminContactPort,
  EmailItem,
  MailerPort,
} from './ports/mailer.port';

interface Cliente {
  email: string;
  nombreCompleto: string;
}

// Qué correo se manda ante cada hecho del negocio, y a quién. Antes esta
// lógica estaba repartida en orders, payments y auth; ahora esos módulos
// solo publican eventos.
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(MAILER) private readonly mail: MailerPort,
    @Inject(ADMIN_CONTACT) private readonly admin: AdminContactPort,
    @Inject(VOUCHER_GENERATOR) private readonly voucher: VoucherGeneratorPort,
  ) {}

  async pedidoCreado(p: {
    orderNumber: string;
    total: number;
    lineas: EmailItem[];
    cliente: Cliente;
  }): Promise<void> {
    await this.mail.sendOrderConfirmation(
      p.cliente.email,
      p.cliente.nombreCompleto,
      p.orderNumber,
      p.lineas,
      p.total,
    );
    const adminEmail = this.admin.adminEmail();
    if (adminEmail) {
      await this.mail.sendNewOrderAdmin(
        adminEmail,
        p.orderNumber,
        p.cliente.nombreCompleto,
        p.total,
        p.lineas,
      );
    }
  }

  async estadoDePedidoCambiado(c: {
    orderNumber: string;
    estadoNuevo: string;
    emailCliente: string | null;
    nombreCliente: string;
    notificar: boolean;
  }): Promise<void> {
    if (!c.notificar) return;

    if (c.emailCliente) {
      await this.mail.sendOrderStatusUpdate(
        c.emailCliente,
        c.nombreCliente,
        c.orderNumber,
        c.estadoNuevo,
      );
    }
    const adminEmail = this.admin.adminEmail();
    if (adminEmail) {
      await this.mail.sendOrderStatusUpdateAdmin(
        adminEmail,
        c.orderNumber,
        c.estadoNuevo,
        c.nombreCliente,
      );
    }
  }

  /** Comprobante de pago con PDF, al cliente (si hay datos de envío) y al admin. */
  async pagoAprobado(p: {
    orderNumber: string;
    total: number;
    lineas: EmailItem[];
    cliente: Cliente | null;
  }): Promise<void> {
    // Se genera una sola vez por evento, antes de los envíos: si falla, el
    // error sube al bus (que lo registra) y no sale ningún correo a medias.
    const comprobantePdf = await this.voucher.generate({
      orderNumber: p.orderNumber,
      total: p.total,
      items: p.lineas,
    });
    if (p.cliente) {
      await this.mail.sendPaymentConfirmation(
        p.cliente.email,
        p.cliente.nombreCompleto,
        p.orderNumber,
        p.total,
        comprobantePdf,
      );
    }
    const adminEmail = this.admin.adminEmail();
    if (adminEmail) {
      await this.mail.sendPaymentConfirmation(
        adminEmail,
        'Admin',
        p.orderNumber,
        p.total,
        comprobantePdf,
      );
    }
  }

  async pagoSinPedido(i: { orderNumber: string; detalle: string }) {
    const adminEmail = this.admin.adminEmail();
    if (adminEmail) {
      await this.mail.sendStockAlert(adminEmail, i.orderNumber, i.detalle);
    }
  }

  bienvenida(u: { email: string; nombre: string }) {
    return this.mail.sendWelcome(u.email, u.nombre);
  }

  codigoDeAcceso(s: { email: string; codigo: string }) {
    return this.mail.sendOtp(s.email, s.codigo);
  }

  restablecimientoDeClave(s: { email: string; resetUrl: string }) {
    return this.mail.sendPasswordReset(s.email, s.resetUrl);
  }
}
