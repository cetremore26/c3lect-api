import {
  ForbiddenError,
  NotFoundError,
} from '../../../../shared/domain/domain-error';
import { EstadoPedido } from '../../domain/order-status';
import { GetOrderUseCase } from './get-order.use-case';

function makeUseCase(order: object | null) {
  const orders = { findById: jest.fn().mockResolvedValue(order) };
  return new GetOrderUseCase(orders as any);
}

const pedido = {
  id: 'order-1',
  userId: 'user-1',
  status: EstadoPedido.CONFIRMADO,
};

describe('GetOrderUseCase', () => {
  it('incluye las transiciones que permite la maquina de estados', async () => {
    const result = await makeUseCase(pedido).execute('order-1', {
      rol: 'ADMIN',
    });

    expect(result.transicionesPermitidas).toEqual([
      EstadoPedido.EN_CAMINO,
      EstadoPedido.CANCELADO,
    ]);
  });

  it('un pedido en estado final no ofrece transiciones', async () => {
    const result = await makeUseCase({
      ...pedido,
      status: EstadoPedido.ENTREGADO,
    }).execute('order-1', { rol: 'ADMIN' });

    expect(result.transicionesPermitidas).toEqual([]);
  });

  it('un cliente no puede ver pedidos de otro', async () => {
    await expect(
      makeUseCase(pedido).execute('order-1', {
        userId: 'otro',
        rol: 'CLIENTE',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('lanza NotFoundError si no existe', async () => {
    await expect(
      makeUseCase(null).execute('x', { rol: 'ADMIN' }),
    ).rejects.toThrow(NotFoundError);
  });
});
