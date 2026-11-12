import {
  ForbiddenError,
  NotFoundError,
} from '../../../../shared/domain/domain-error';
import { GetPaymentUseCase } from './get-payment.use-case';

const pagoCompleto = {
  id: 'payment-1',
  orderId: 'order-1',
  orderNumber: 'C3L-1',
  userId: 'u1',
  estado: 'PENDIENTE',
  preferenceId: 'pref-1',
  checkoutUrl: 'https://mp.com/checkout',
  mpPaymentId: 'mp-1',
  total: 1000,
  draftPayload: { shippingInfo: { email: 'x@y.com' } },
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
};

function make(
  order: { userId: string | null } | null,
  payment: unknown = pagoCompleto,
) {
  const payments = {
    findMostRecentByOrderId: jest.fn().mockResolvedValue(payment),
  };
  const orders = { findForPayment: jest.fn().mockResolvedValue(order) };
  const useCase = new GetPaymentUseCase(payments as any, orders as any);
  return { useCase, payments, orders };
}

describe('GetPaymentUseCase', () => {
  it('el dueño ve el pago sin draftPayload ni userId', async () => {
    const { useCase, payments } = make({ userId: 'u1' });

    const r = await useCase.execute('order-1', {
      userId: 'u1',
      rol: 'CLIENTE',
    });

    expect(r).toEqual({
      id: 'payment-1',
      orderId: 'order-1',
      orderNumber: 'C3L-1',
      estado: 'PENDIENTE',
      total: 1000,
      checkoutUrl: 'https://mp.com/checkout',
      createdAt: pagoCompleto.createdAt,
      updatedAt: pagoCompleto.updatedAt,
    });
    expect(r).not.toHaveProperty('draftPayload');
    expect(r).not.toHaveProperty('userId');
    expect(payments.findMostRecentByOrderId).toHaveBeenCalledWith('order-1');
  });

  it('otro cliente lanza ForbiddenError', async () => {
    const { useCase } = make({ userId: 'u1' });
    await expect(
      useCase.execute('order-1', { userId: 'u2', rol: 'CLIENTE' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('pedido de invitado: un cliente recibe ForbiddenError', async () => {
    const { useCase } = make({ userId: null });
    await expect(
      useCase.execute('order-1', { userId: 'u2', rol: 'CLIENTE' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('ADMIN ve cualquiera', async () => {
    const { useCase } = make({ userId: 'u1' });
    const r = await useCase.execute('order-1', { userId: 'a1', rol: 'ADMIN' });
    expect(r.id).toBe('payment-1');
  });

  it('pedido inexistente lanza NotFoundError', async () => {
    const { useCase } = make(null);
    await expect(
      useCase.execute('order-1', { userId: 'u1', rol: 'CLIENTE' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('sin pago lanza NotFoundError', async () => {
    const { useCase } = make({ userId: 'u1' }, null);
    await expect(
      useCase.execute('order-1', { userId: 'u1', rol: 'CLIENTE' }),
    ).rejects.toThrow(NotFoundError);
  });
});
