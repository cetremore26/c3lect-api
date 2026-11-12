import { UnauthorizedError } from '../../../../shared/domain/domain-error';
import { PaymentsController } from './payments.controller';

describe('PaymentsController.handleWebhook', () => {
  const dto = { type: 'payment', data: { id: '1' } };

  function build(execute: jest.Mock) {
    return new PaymentsController(
      {} as never,
      {} as never,
      { execute } as never,
      {} as never,
    );
  }

  it('responde { received: true } solo despues de procesar', async () => {
    let resolver!: () => void;
    const execute = jest.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolver = resolve;
      }),
    );
    let resuelto = false;
    const promesa = build(execute)
      .handleWebhook(dto, 'sig', 'req')
      .then((r) => {
        resuelto = true;
        return r;
      });

    await Promise.resolve();
    await Promise.resolve();
    expect(resuelto).toBe(false);

    resolver();
    await expect(promesa).resolves.toEqual({ received: true });
    expect(execute).toHaveBeenCalledWith(dto, 'sig', 'req');
  });

  it('propaga UnauthorizedError (el filtro global responde 401)', async () => {
    const execute = jest.fn().mockRejectedValue(new UnauthorizedError('firma'));
    await expect(build(execute).handleWebhook(dto)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('propaga un error inesperado (500) para que MercadoPago reintente', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('DB caida'));
    await expect(build(execute).handleWebhook(dto)).rejects.toThrow('DB caida');
  });
});
