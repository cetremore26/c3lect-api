import { NotificationsService } from './notifications.service';

function makeService(adminEmail?: string) {
  const mail = {
    sendOtp: jest.fn(),
    sendPasswordReset: jest.fn(),
    sendWelcome: jest.fn(),
    sendOrderConfirmation: jest.fn(),
    sendOrderStatusUpdate: jest.fn(),
    sendPaymentConfirmation: jest.fn(),
    sendNewOrderAdmin: jest.fn(),
    sendOrderStatusUpdateAdmin: jest.fn(),
    sendStockAlert: jest.fn(),
  };
  const service = new NotificationsService(mail, {
    adminEmail: () => adminEmail,
  });
  return { service, mail };
}

const cliente = { email: 'cliente@test.com', nombreCompleto: 'Cliente Test' };
const pdf = Buffer.from('pdf');

describe('NotificationsService', () => {
  it('pedido creado: confirma al cliente y, si hay ADMIN_EMAIL, avisa al admin', async () => {
    const lineas = [
      { nombre: 'Reloj', cantidad: 1, precioUnitario: 1000, subtotal: 1000 },
    ];
    const { service, mail } = makeService('admin@c3lect.com');

    await service.pedidoCreado({
      orderNumber: 'C3L-1',
      total: 1000,
      lineas,
      cliente,
    });

    expect(mail.sendOrderConfirmation).toHaveBeenCalledWith(
      'cliente@test.com',
      'Cliente Test',
      'C3L-1',
      lineas,
      1000,
    );
    expect(mail.sendNewOrderAdmin).toHaveBeenCalledWith(
      'admin@c3lect.com',
      'C3L-1',
      'Cliente Test',
      1000,
      lineas,
    );
  });

  describe('estadoDePedidoCambiado', () => {
    const cambio = {
      orderNumber: 'C3L-1',
      estadoNuevo: 'EN_CAMINO',
      emailCliente: 'cliente@test.com',
      nombreCliente: 'Cliente Test',
      notificar: true,
    };

    it('avisa al cliente y al admin', async () => {
      const { service, mail } = makeService('admin@c3lect.com');

      await service.estadoDePedidoCambiado(cambio);

      expect(mail.sendOrderStatusUpdate).toHaveBeenCalledWith(
        'cliente@test.com',
        'Cliente Test',
        'C3L-1',
        'EN_CAMINO',
      );
      expect(mail.sendOrderStatusUpdateAdmin).toHaveBeenCalled();
    });

    it('con notificar=false (confirmacion por MercadoPago) no manda nada', async () => {
      const { service, mail } = makeService('admin@c3lect.com');

      await service.estadoDePedidoCambiado({ ...cambio, notificar: false });

      expect(mail.sendOrderStatusUpdate).not.toHaveBeenCalled();
      expect(mail.sendOrderStatusUpdateAdmin).not.toHaveBeenCalled();
    });
  });

  describe('pagoAprobado', () => {
    it('sin ADMIN_EMAIL, manda el comprobante solo al cliente', async () => {
      const { service, mail } = makeService();

      await service.pagoAprobado({
        orderNumber: 'C3L-1',
        total: 50000,
        cliente,
        comprobantePdf: pdf,
      });

      expect(mail.sendPaymentConfirmation).toHaveBeenCalledTimes(1);
      expect(mail.sendPaymentConfirmation).toHaveBeenCalledWith(
        'cliente@test.com',
        'Cliente Test',
        'C3L-1',
        50000,
        pdf,
      );
    });

    it('con ADMIN_EMAIL, tambien manda el comprobante al admin', async () => {
      const { service, mail } = makeService('admin@c3lect.com');

      await service.pagoAprobado({
        orderNumber: 'C3L-1',
        total: 50000,
        cliente,
        comprobantePdf: pdf,
      });

      expect(mail.sendPaymentConfirmation).toHaveBeenCalledWith(
        'admin@c3lect.com',
        'Admin',
        'C3L-1',
        50000,
        pdf,
      );
    });

    it('si el pedido no tiene datos de envio, no manda comprobante al cliente', async () => {
      const { service, mail } = makeService();

      await service.pagoAprobado({
        orderNumber: 'C3L-1',
        total: 50000,
        cliente: null,
        comprobantePdf: pdf,
      });

      expect(mail.sendPaymentConfirmation).not.toHaveBeenCalled();
    });
  });

  it('pago sin pedido: alerta al admin si esta configurado, si no a nadie', async () => {
    const conAdmin = makeService('admin@c3lect.com');
    const sinAdmin = makeService();
    const incidente = { orderNumber: 'C3L-1', detalle: 'Stock insuficiente' };

    await conAdmin.service.pagoSinPedido(incidente);
    await sinAdmin.service.pagoSinPedido(incidente);

    expect(conAdmin.mail.sendStockAlert).toHaveBeenCalledWith(
      'admin@c3lect.com',
      'C3L-1',
      'Stock insuficiente',
    );
    expect(sinAdmin.mail.sendStockAlert).not.toHaveBeenCalled();
  });
});
