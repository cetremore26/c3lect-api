import { CreatePendingOrderPaymentUseCase } from './create-pending-order-payment.use-case';

function makeUseCase(resolved: Record<string, unknown>) {
  const ordersService = {
    resolveItems: jest.fn().mockResolvedValue(resolved),
  };
  const gateway = {
    createPreference: jest.fn().mockResolvedValue({
      preferenceId: 'pref-1',
      checkoutUrl: 'https://mp.com/checkout/pref-1',
    }),
  };
  const payments = {
    create: jest.fn().mockResolvedValue({ id: 'payment-1' }),
  };

  const useCase = new CreatePendingOrderPaymentUseCase(
    ordersService as any,
    gateway as any,
    payments as any,
  );
  return { useCase, ordersService, gateway, payments };
}

const dto = {
  items: [{ productId: 'prod-1', cantidad: 1 }],
  shippingInfo: {
    email: 'cliente@test.com',
    nombreCompleto: 'Cliente Test',
    telefono: '3000000000',
    ciudad: 'Bogota',
    departamento: 'Bogota',
    direccion: 'Calle 1',
  },
  fbp: 'fb.p.1',
  fbc: 'fb.c.1',
} as any;

const resolved = {
  itemsData: [
    {
      productId: 'prod-1',
      nombre: 'Reloj',
      precioUnitario: 50000,
      cantidad: 1,
      subtotal: 50000,
    },
  ],
  subtotal: 50000,
  total: 50000,
};

describe('CreatePendingOrderPaymentUseCase', () => {
  it('resuelve los items server-side marcando al usuario como autenticado si hay userId', async () => {
    const { useCase, ordersService } = makeUseCase(resolved);

    await useCase.execute(dto, 'user-1');

    expect(ordersService.resolveItems).toHaveBeenCalledWith(dto.items, true);
  });

  it('trata al comprador como invitado si no hay userId', async () => {
    const { useCase, ordersService } = makeUseCase(resolved);

    await useCase.execute(dto);

    expect(ordersService.resolveItems).toHaveBeenCalledWith(dto.items, false);
  });

  it('crea el pago sin orderId y con el draftPayload congelado', async () => {
    const { useCase, payments } = makeUseCase(resolved);

    await useCase.execute(dto, 'user-1');

    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: null,
        userId: 'user-1',
        estado: 'PENDIENTE',
        total: 50000,
        draftPayload: expect.objectContaining({
          itemsData: resolved.itemsData,
          subtotal: 50000,
          total: 50000,
          shippingInfo: dto.shippingInfo,
          userId: 'user-1',
          fbp: 'fb.p.1',
          fbc: 'fb.c.1',
        }),
      }),
    );
  });

  it('pide la preferencia usando el email del shippingInfo del dto', async () => {
    const { useCase, gateway } = makeUseCase(resolved);

    await useCase.execute(dto);

    expect(gateway.createPreference).toHaveBeenCalledWith(
      expect.objectContaining({ payerEmail: 'cliente@test.com' }),
    );
  });

  it('deja checkoutUrl en cadena vacia si el gateway no devuelve ninguna url', async () => {
    const { useCase, gateway } = makeUseCase(resolved);
    gateway.createPreference.mockResolvedValue({
      preferenceId: 'pref-1',
      checkoutUrl: '',
    });

    const result = await useCase.execute(dto);

    expect(result.checkoutUrl).toBe('');
  });

  it('guarda preferenceId en null si el gateway no devuelve id', async () => {
    const { useCase, gateway, payments } = makeUseCase(resolved);
    gateway.createPreference.mockResolvedValue({
      preferenceId: undefined,
      checkoutUrl: 'https://mp.com/checkout/pref-1',
    });

    await useCase.execute(dto);

    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({ preferenceId: null }),
    );
  });

  it('congela fbp y fbc en null cuando el dto no trae cookies de Meta Pixel', async () => {
    const { useCase, payments } = makeUseCase(resolved);
    const dtoSinCookies = {
      items: dto.items,
      shippingInfo: dto.shippingInfo,
    } as any;

    await useCase.execute(dtoSinCookies);

    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        draftPayload: expect.objectContaining({ fbp: null, fbc: null }),
      }),
    );
  });
});
