import { NotFoundError } from '../../../../shared/domain/domain-error';
import { GetPaymentUseCase } from './get-payment.use-case';

describe('GetPaymentUseCase', () => {
  it('devuelve el pago mas reciente del pedido', async () => {
    const payments = {
      findMostRecentByOrderId: jest.fn().mockResolvedValue({ id: 'payment-1' }),
    };
    const useCase = new GetPaymentUseCase(payments as any);

    const result = await useCase.execute('order-1');

    expect(result).toEqual({ id: 'payment-1' });
    expect(payments.findMostRecentByOrderId).toHaveBeenCalledWith('order-1');
  });

  it('lanza NotFoundError si no hay pago para el pedido', async () => {
    const payments = {
      findMostRecentByOrderId: jest.fn().mockResolvedValue(null),
    };
    const useCase = new GetPaymentUseCase(payments as any);

    await expect(useCase.execute('order-1')).rejects.toThrow(NotFoundError);
  });
});
