import {
  BusinessRuleViolation,
  ForbiddenError,
  NotFoundError,
} from '../../../../shared/domain/domain-error';
import { CreatePaymentUseCase } from './create-payment.use-case';

// Fakes en memoria de los 3 ports — sin jest.mock('mercadopago', ...) a
// nivel de modulo y sin mockear Prisma: exactamente el salto de calidad que
// motivo este refactor (ver plan de payments).
function makeUseCase(order: Record<string, unknown> | null) {
  const orders = {
    findForPayment: jest.fn().mockResolvedValue(order),
  };
  const gateway = {
    createPreference: jest.fn().mockResolvedValue({
      preferenceId: 'pref-1',
      checkoutUrl: 'https://mp.com/checkout/pref-1',
    }),
  };
  const payments = {
    create: jest.fn().mockResolvedValue({ id: 'payment-9' }),
  };

  const useCase = new CreatePaymentUseCase(
    orders as any,
    gateway as any,
    payments as any,
  );
  return { useCase, orders, gateway, payments };
}

const cliente = { userId: 'user-1', rol: 'CLIENTE' };

const orderBase = {
  id: 'order-1',
  userId: 'user-1',
  orderNumber: 'C3L-20260101-ABCDE',
  pendiente: true,
  total: 150000,
  items: [
    {
      productId: 'prod-1',
      nombre: 'Reloj',
      cantidad: 2,
      precioUnitario: 50000,
    },
  ],
  shippingInfo: { email: 'cliente@test.com' },
};

describe('CreatePaymentUseCase', () => {
  it('lanza NotFoundError si el pedido no existe', async () => {
    const { useCase, gateway } = makeUseCase(null);

    await expect(useCase.execute({ orderId: 'nope' }, cliente)).rejects.toThrow(
      NotFoundError,
    );
    expect(gateway.createPreference).not.toHaveBeenCalled();
  });

  it('lanza BusinessRuleViolation si el pedido ya no esta PENDIENTE', async () => {
    const { useCase, gateway } = makeUseCase({
      ...orderBase,
      pendiente: false,
    });

    await expect(
      useCase.execute({ orderId: 'order-1' }, cliente),
    ).rejects.toThrow(BusinessRuleViolation);
    expect(gateway.createPreference).not.toHaveBeenCalled();
  });

  it('pide la preferencia con los items, el email y el orderNumber del pedido', async () => {
    const { useCase, gateway } = makeUseCase(orderBase);

    await useCase.execute({ orderId: 'order-1' }, cliente);

    expect(gateway.createPreference).toHaveBeenCalledWith({
      items: [{ id: 'prod-1', title: 'Reloj', quantity: 2, unitPrice: 50000 }],
      payerEmail: 'cliente@test.com',
      externalReference: 'C3L-20260101-ABCDE',
    });
  });

  it('usa un email generico cuando el pedido no tiene shippingInfo', async () => {
    const { useCase, gateway } = makeUseCase({
      ...orderBase,
      shippingInfo: null,
    });

    await useCase.execute({ orderId: 'order-1' }, cliente);

    expect(gateway.createPreference).toHaveBeenCalledWith(
      expect.objectContaining({ payerEmail: 'cliente@c3lect.com' }),
    );
  });

  it('registra el pago con el total del pedido y el userId', async () => {
    const { useCase, payments } = makeUseCase(orderBase);

    await useCase.execute({ orderId: 'order-1' }, cliente);

    expect(payments.create).toHaveBeenCalledWith({
      orderId: 'order-1',
      orderNumber: 'C3L-20260101-ABCDE',
      userId: 'user-1',
      estado: 'PENDIENTE',
      preferenceId: 'pref-1',
      checkoutUrl: 'https://mp.com/checkout/pref-1',
      total: 150000,
    });
  });

  it('devuelve checkoutUrl, preferenceId y paymentId', async () => {
    const { useCase } = makeUseCase(orderBase);

    const result = await useCase.execute({ orderId: 'order-1' }, cliente);

    expect(result).toEqual({
      checkoutUrl: 'https://mp.com/checkout/pref-1',
      preferenceId: 'pref-1',
      paymentId: 'payment-9',
    });
  });

  it('deja checkoutUrl en cadena vacia si el gateway no devuelve ninguna url', async () => {
    const { useCase, gateway } = makeUseCase(orderBase);
    gateway.createPreference.mockResolvedValue({
      preferenceId: 'pref-1',
      checkoutUrl: '',
    });

    const result = await useCase.execute({ orderId: 'order-1' }, cliente);

    expect(result.checkoutUrl).toBe('');
  });

  it('guarda preferenceId en null si el gateway no devuelve id, pero lo retorna como undefined', async () => {
    const { useCase, gateway, payments } = makeUseCase(orderBase);
    gateway.createPreference.mockResolvedValue({
      preferenceId: undefined,
      checkoutUrl: 'https://mp.com/checkout/pref-1',
    });

    const result = await useCase.execute({ orderId: 'order-1' }, cliente);

    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({ preferenceId: null }),
    );
    expect(result.preferenceId).toBeUndefined();
  });

  it('un cliente que no es dueño no crea preferencia', async () => {
    const { useCase, gateway } = makeUseCase(orderBase);

    await expect(
      useCase.execute(
        { orderId: 'order-1' },
        { userId: 'otro', rol: 'CLIENTE' },
      ),
    ).rejects.toThrow(ForbiddenError);
    expect(gateway.createPreference).not.toHaveBeenCalled();
  });

  it('un invitado no puede usar el flujo viejo', async () => {
    const { useCase, gateway } = makeUseCase({ ...orderBase, userId: null });

    await expect(useCase.execute({ orderId: 'order-1' }, {})).rejects.toThrow(
      ForbiddenError,
    );
    expect(gateway.createPreference).not.toHaveBeenCalled();
  });

  it('ADMIN puede crear el pago de un pedido ajeno', async () => {
    const { useCase, gateway } = makeUseCase({ ...orderBase, userId: null });

    await useCase.execute(
      { orderId: 'order-1' },
      { userId: 'a1', rol: 'ADMIN' },
    );

    expect(gateway.createPreference).toHaveBeenCalled();
  });
});
