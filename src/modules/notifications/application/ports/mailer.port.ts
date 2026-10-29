export const MAILER = Symbol('MAILER');
export const ADMIN_CONTACT = Symbol('ADMIN_CONTACT');

export interface EmailItem {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

// Los correos que sabe enviar la tienda. Las plantillas y el proveedor
// (Resend) son detalle de infraestructura: los implementa MailService.
export interface MailerPort {
  sendOtp(email: string, code: string): Promise<void>;
  sendPasswordReset(email: string, resetUrl: string): Promise<void>;
  sendWelcome(email: string, nombre: string): Promise<void>;
  sendOrderConfirmation(
    email: string,
    nombre: string,
    orderNumber: string,
    items: EmailItem[],
    total: number,
  ): Promise<void>;
  sendOrderStatusUpdate(
    email: string,
    nombre: string,
    orderNumber: string,
    nuevoStatus: string,
  ): Promise<void>;
  sendPaymentConfirmation(
    email: string,
    nombre: string,
    orderNumber: string,
    total: number,
    pdfBuffer: Buffer,
  ): Promise<void>;
  sendNewOrderAdmin(
    adminEmail: string,
    orderNumber: string,
    clienteNombre: string,
    total: number,
    items: EmailItem[],
  ): Promise<void>;
  sendOrderStatusUpdateAdmin(
    adminEmail: string,
    orderNumber: string,
    nuevoStatus: string,
    clienteNombre: string,
  ): Promise<void>;
  sendStockAlert(
    adminEmail: string,
    orderNumber: string,
    detalle: string,
  ): Promise<void>;
}

export interface AdminContactPort {
  /** Correo del admin que recibe avisos; undefined si no está configurado. */
  adminEmail(): string | undefined;
}
