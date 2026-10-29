import { ConversionTrackingService } from './conversion-tracking.service';

function makeService() {
  const meta = {
    sendPurchase: jest.fn().mockResolvedValue(undefined),
    sendOfflinePurchase: jest.fn().mockResolvedValue(undefined),
  };
  return { service: new ConversionTrackingService(meta), meta };
}

describe('ConversionTrackingService', () => {
  it('compra web: envia Purchase con datos del cliente, cookies y orderNumber como event_id', async () => {
    const { service, meta } = makeService();

    await service.compraWeb({
      orderNumber: 'C3L-1',
      total: 50000,
      productIds: ['prod-1'],
      cliente: {
        email: 'cliente@test.com',
        nombreCompleto: 'Cliente de Prueba',
        telefono: '3000000000',
        ciudad: 'Bogota',
        departamento: 'Bogota',
      },
      fbp: 'fb.p.1',
      fbc: 'fb.c.1',
    });

    expect(meta.sendPurchase).toHaveBeenCalledWith({
      orderNumber: 'C3L-1',
      total: 50000,
      contentIds: ['prod-1'],
      user: {
        email: 'cliente@test.com',
        phone: '3000000000',
        firstName: 'Cliente',
        lastName: 'de Prueba',
        city: 'Bogota',
        state: 'Bogota',
        fbp: 'fb.p.1',
        fbc: 'fb.c.1',
      },
    });
  });

  it('compra web sin datos de envio: manda el evento sin datos de usuario', async () => {
    const { service, meta } = makeService();

    await service.compraWeb({
      orderNumber: 'C3L-1',
      total: 50000,
      productIds: [],
      cliente: null,
      fbp: null,
      fbc: null,
    });

    expect(meta.sendPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          email: undefined,
          firstName: undefined,
        }),
      }),
    );
  });

  describe('ventaOffline', () => {
    const venta = {
      ventaId: 'venta-1',
      precioVenta: 1000,
      cliente: 'Ana Gomez',
      celular: '3000000000',
      fecha: new Date('2026-01-01T00:00:00Z'),
      elegibleMetaOffline: true,
    };

    it('reporta la venta elegible como Purchase offline con la fecha real', async () => {
      const { service, meta } = makeService();

      await service.ventaOffline(venta);

      expect(meta.sendOfflinePurchase).toHaveBeenCalledWith({
        ventaId: 'venta-1',
        total: 1000,
        user: { phone: '3000000000', firstName: 'Ana', lastName: 'Gomez' },
        eventTime: 1767225600,
      });
    });

    it('no envia nada si la venta no es elegible', async () => {
      const { service, meta } = makeService();

      await service.ventaOffline({ ...venta, elegibleMetaOffline: false });

      expect(meta.sendOfflinePurchase).not.toHaveBeenCalled();
    });
  });
});
