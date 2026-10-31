import {
  BusinessRuleViolation,
  NotFoundError,
} from '../../../../shared/domain/domain-error';
import { fakeEventBus, fakeUnitOfWork } from '../../../../shared/testing/fakes';
import {
  ConfirmacionDePedidoRevertida,
  EstadoDePedidoCambiado,
  PedidoConfirmado,
} from '../../domain/order-events';
import { EstadoPedido } from '../../domain/order-status';
import { UpdateOrderStatusUseCase } from './update-order-status.use-case';

// Fakes en memoria de los puertos: esta suite verifica decisiones de
// orquestacion (que transicion se permite, que eventos se publican y si van
// dentro de la transaccion). Como se descuenta el stock lo prueba inventario.
const item = {
  id: 'item-1',
  orderId: 'order-1',
  productId: 'prod-1',
  nombre: 'Rolex Submariner',
  cantidad: 2,
  precioUnitario: 1000,
  subtotal: 2000,
};

function makeOrder(
  status: EstadoPedido,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'order-1',
    orderNumber: 'C3L-20260101-ABCDE',
    status,
    items: [item],
    shippingInfo: {
      email: 'cliente@test.com',
      nombreCompleto: 'Cliente Test',
      telefono: '3000000000',
    },
    user: null,
    ...overrides,
  };
}

function makeUseCase(order: ReturnType<typeof makeOrder> | null) {
  const orders = {
    findByIdForStatusTransition: jest.fn().mockResolvedValue(order),
    transitionStatus: jest
      .fn()
      .mockImplementation((params) =>
        Promise.resolve({ ...order, status: params.statusNuevo }),
      ),
  };
  const catalog = {
    findAvailableByIds: jest.fn(),
    findByIds: jest.fn().mockResolvedValue(
      new Map([
        [
          'prod-1',
          {
            id: 'prod-1',
            nombre: 'Rolex Submariner',
            marca: 'Rolex',
            cat: 'reloj',
            precio: 1000,
          },
        ],
      ]),
    ),
  };
  const uow = fakeUnitOfWork();
  const events = fakeEventBus();
  const audit = { log: jest.fn() };

  const useCase = new UpdateOrderStatusUseCase(
    orders as any,
    catalog,
    uow,
    events,
    audit,
  );
  return { useCase, orders, uow, events, audit };
}

describe('UpdateOrderStatusUseCase', () => {
  it('lanza NotFoundError si el pedido no existe', async () => {
    const { useCase } = makeUseCase(null);

    await expect(
      useCase.execute('order-1', EstadoPedido.CONFIRMADO, 'admin-1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('rechaza una transicion invalida sin tocar el repositorio ni publicar', async () => {
    const { useCase, orders, events } = makeUseCase(
      makeOrder(EstadoPedido.ENTREGADO),
    );

    await expect(
      useCase.execute('order-1', EstadoPedido.CONFIRMADO, 'admin-1'),
    ).rejects.toThrow(BusinessRuleViolation);
    expect(orders.transitionStatus).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('al confirmar, publica PedidoConfirmado con marca/modelo resueltos, dentro de la transaccion', async () => {
    const { useCase, uow, events } = makeUseCase(
      makeOrder(EstadoPedido.PENDIENTE),
    );
    uow.run.mockImplementation(async (work) => {
      expect(events.publish).not.toHaveBeenCalled();
      const result = await work();
      expect(events.of(PedidoConfirmado)).toHaveLength(1);
      return result;
    });

    await useCase.execute('order-1', EstadoPedido.CONFIRMADO, 'admin-1');

    expect(events.of(PedidoConfirmado)[0].pedido).toEqual({
      orderId: 'order-1',
      orderNumber: 'C3L-20260101-ABCDE',
      cliente: 'Cliente Test',
      celular: '3000000000',
      lineas: [
        {
          productId: 'prod-1',
          nombre: 'Rolex Submariner',
          marca: 'Rolex',
          modelo: 'Submariner',
          cantidad: 2,
          precioUnitario: 1000,
        },
      ],
    });
    expect(events.of(ConfirmacionDePedidoRevertida)).toHaveLength(0);
  });

  it('al cancelar un pedido ya CONFIRMADO, publica ConfirmacionDePedidoRevertida', async () => {
    const { useCase, events } = makeUseCase(makeOrder(EstadoPedido.CONFIRMADO));

    await useCase.execute('order-1', EstadoPedido.CANCELADO, 'admin-1');

    expect(events.of(ConfirmacionDePedidoRevertida)).toHaveLength(1);
    expect(events.of(PedidoConfirmado)).toHaveLength(0);
  });

  it('al cancelar un pedido PENDIENTE, no pide tocar stock ni ventas', async () => {
    const { useCase, events } = makeUseCase(makeOrder(EstadoPedido.PENDIENTE));

    await useCase.execute('order-1', EstadoPedido.CANCELADO, 'admin-1');

    expect(events.of(PedidoConfirmado)).toHaveLength(0);
    expect(events.of(ConfirmacionDePedidoRevertida)).toHaveLength(0);
  });

  it('siempre publica EstadoDePedidoCambiado con los datos para notificar', async () => {
    const { useCase, events } = makeUseCase(makeOrder(EstadoPedido.CONFIRMADO));

    await useCase.execute('order-1', EstadoPedido.EN_CAMINO, 'admin-1');

    expect(events.of(EstadoDePedidoCambiado)[0].cambio).toEqual({
      orderId: 'order-1',
      orderNumber: 'C3L-20260101-ABCDE',
      estadoAnterior: EstadoPedido.CONFIRMADO,
      estadoNuevo: EstadoPedido.EN_CAMINO,
      emailCliente: 'cliente@test.com',
      nombreCliente: 'Cliente Test',
      notificar: true,
    });
  });

  it('con notificar=false (confirmacion por MercadoPago) el evento lo indica', async () => {
    const { useCase, events } = makeUseCase(makeOrder(EstadoPedido.PENDIENTE));

    await useCase.execute('order-1', EstadoPedido.CONFIRMADO, 'MERCADOPAGO', {
      notificar: false,
    });

    expect(events.of(EstadoDePedidoCambiado)[0].cambio.notificar).toBe(false);
  });

  it('registra la transicion en auditoria con quien la hizo', async () => {
    const { useCase, audit } = makeUseCase(makeOrder(EstadoPedido.CONFIRMADO));

    await useCase.execute('order-1', EstadoPedido.EN_CAMINO, 'admin-1');

    expect(audit.log).toHaveBeenCalledWith(
      'ESTADO',
      'pedido',
      'order-1',
      expect.stringContaining('CONFIRMADO → EN_CAMINO'),
      'admin-1',
    );
  });
});
