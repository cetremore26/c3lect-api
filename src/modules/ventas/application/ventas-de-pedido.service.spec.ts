import { VentasDePedidoService } from './ventas-de-pedido.service';

function makeService() {
  const repo = {
    createMany: jest.fn(),
    removeByOrderId: jest.fn(),
  };
  const service = new VentasDePedidoService(repo as any);
  return { service, repo };
}

describe('VentasDePedidoService', () => {
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

  it('anular borra todas las ventas del pedido', async () => {
    const { service, repo } = makeService();

    await service.anular('order-1');

    expect(repo.removeByOrderId).toHaveBeenCalledWith('order-1');
  });
});
