import { TooManyRequestsError } from '../../../../shared/domain/domain-error';
import { MetodoPago } from '../../domain/order-status';
import { CreateOrderUseCase } from './create-order.use-case';

const cmd = {
  metodoPago: MetodoPago.NEQUI,
  items: [{ productId: 'p', cantidad: 1 }],
  shippingInfo: {
    nombreCompleto: 'Ana',
    email: 'ana@example.com',
    telefono: '300',
    ciudad: 'Bogotá',
    departamento: 'Cundinamarca',
    direccion: 'Calle 1',
  },
};

function setup(recientes: number) {
  const orders = {
    countByShippingEmailSince: jest.fn().mockResolvedValue(recientes),
    create: jest.fn().mockResolvedValue({
      id: 'o1',
      orderNumber: 'N1',
      total: 100,
      paymentMethod: MetodoPago.NEQUI,
      items: [],
      fbp: null,
      fbc: null,
    }),
  };
  const resolve = {
    execute: jest
      .fn()
      .mockResolvedValue({ itemsData: [], subtotal: 100, total: 100 }),
  };
  const events = { publish: jest.fn() };
  const uc = new CreateOrderUseCase(
    orders as any,
    resolve as any,
    events as any,
  );
  return { uc, orders, resolve };
}

describe('CreateOrderUseCase - límite por correo', () => {
  it('el sexto pedido del mismo email en una hora → TooManyRequestsError y no crea', async () => {
    const { uc, orders, resolve } = setup(5);
    await expect(uc.execute(cmd)).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(orders.create).not.toHaveBeenCalled();
    expect(resolve.execute).not.toHaveBeenCalled();
    const [email, desde] = orders.countByShippingEmailSince.mock.calls[0];
    expect(email).toBe('ana@example.com');
    expect(Date.now() - desde.getTime()).toBeGreaterThanOrEqual(
      3_600_000 - 1000,
    );
  });

  it('con 4 pedidos recientes crea el pedido', async () => {
    const { uc, orders } = setup(4);
    await uc.execute(cmd);
    expect(orders.create).toHaveBeenCalled();
  });
});
