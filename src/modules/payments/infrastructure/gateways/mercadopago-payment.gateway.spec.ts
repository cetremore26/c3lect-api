import { ConfigService } from '@nestjs/config';
import { Payment as MpPayment } from 'mercadopago';
import { MercadoPagoPaymentGateway } from './mercadopago-payment.gateway';

jest.mock('mercadopago');

describe('MercadoPagoPaymentGateway.getPayment', () => {
  const config = { getOrThrow: () => 'token' } as unknown as ConfigService;

  it('mapea status, external_reference, transaction_amount y currency_id', async () => {
    const get = jest.fn().mockResolvedValue({
      status: 'approved',
      external_reference: 'C3L-1',
      transaction_amount: 50000,
      currency_id: 'COP',
    });
    (MpPayment as unknown as jest.Mock).mockImplementation(() => ({ get }));

    const gateway = new MercadoPagoPaymentGateway(config);
    const result = await gateway.getPayment('mp-1');

    expect(get).toHaveBeenCalledWith({ id: 'mp-1' });
    expect(result).toEqual({
      status: 'approved',
      externalReference: 'C3L-1',
      transactionAmount: 50000,
      currencyId: 'COP',
    });
  });
});
