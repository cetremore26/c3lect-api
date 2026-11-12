import { fakeEventBus } from '../../../shared/testing/fakes';
import { VentasDePedidoAnuladas } from '../domain/venta-events';
import { VentasDePedidoService } from './ventas-de-pedido.service';

function makeService() {
  const repo = {
    createMany: jest.fn(),
    findByOrderId: jest.fn().mockResolvedValue([]),
    removeByOrderId: jest.fn(),
  };
  const events = fakeEventBus();
  const service = new VentasDePedidoService(repo as any, events);
  return { service, repo, events };
}

describe('VentasDePedidoService', () => {
  afterEach(() => jest.useRealTimers());

  it('la fecha de la venta es el día de Bogotá', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-11T03:30:00Z'));
    const { service, repo } = makeService();

    await service.registrar({
      orderId: 'order-1',
      cliente: 'Cliente Test',
      celular: null,
      lineas: [
        {
          marca: 'Rolex',
          modelo: 'Submariner',
          cantidad: 1,
          precioUnitario: 1000,
          costoUnitario: 600,
        },
      ],
    });

    const [filas] = repo.createMany.mock.calls[0];
    expect(filas[0].fecha.toISOString()).toBe('2026-11-10T00:00:00.000Z');
  });

  it('registra una venta "Plataforma" pagada por cada unidad del pedido', async () => {
    const { service, repo } = makeService();

    await service.registrar({
      orderId: 'order-1',
      cliente: 'Cliente Test',
      celular: '3000000000',
      lineas: [
        {
          marca: 'Rolex',
          modelo: 'Submariner',
          cantidad: 2,
          precioUnitario: 1000,
          costoUnitario: 600,
        },
      ],
    });

    const [filas] = repo.createMany.mock.calls[0];
    expect(filas).toHaveLength(2);
    expect(filas[0]).toEqual(
      expect.objectContaining({
        orderId: 'order-1',
        cliente: 'Cliente Test',
        celular: '3000000000',
        marca: 'Rolex',
        modelo: 'Submariner',
        precioVenta: 1000,
        costoProducto: 600,
        abono: 1000,
        saldoPendiente: 0,
        gananciaNeta: 400,
        fuente: 'Plataforma',
        estado: 'Pagado',
      }),
    );
  });

  it('anular borra las ventas del pedido y publica lo despachado agrupado', async () => {
    const { service, repo, events } = makeService();
    repo.findByOrderId.mockResolvedValue([
      { marca: 'Rolex', modelo: 'Submariner' },
      { marca: 'Rolex', modelo: 'Submariner' },
    ]);
    await service.anular('order-1');
    expect(repo.removeByOrderId).toHaveBeenCalledWith('order-1');
    expect(events.of(VentasDePedidoAnuladas)[0].anulacion).toEqual({
      orderId: 'order-1',
      lineas: [{ marca: 'Rolex', modelo: 'Submariner', cantidad: 2 }],
    });
  });

  it('anular sin ventas no publica nada', async () => {
    const { service, repo, events } = makeService();
    repo.findByOrderId.mockResolvedValue([]);
    await service.anular('order-1');
    expect(events.publish).not.toHaveBeenCalled();
  });
});
