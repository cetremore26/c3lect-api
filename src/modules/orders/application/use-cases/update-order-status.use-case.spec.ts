import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EstadoPedido } from '@prisma/client';
import { UpdateOrderStatusUseCase } from './update-order-status.use-case';

// Fake del puerto en memoria en vez de mockear el shape de
// Prisma.TransactionClient: esta suite verifica decisiones de orquestacion
// (que transicion se permite, cuando se piden los efectos de
// confirmacion/reversion, cuando se notifica), no el detalle de como se
// descuenta stock en la base de datos — eso vive en
// infrastructure/prisma-order.repository.spec.ts.
function makeOrder(
  status: EstadoPedido,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'order-1',
    orderNumber: 'C3L-20260101-ABCDE',
    status,
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
  const mail = {
    sendOrderStatusUpdate: jest.fn(),
    sendOrderStatusUpdateAdmin: jest.fn(),
  };
  const config = { get: jest.fn() };
  const audit = { log: jest.fn() };

  const useCase = new UpdateOrderStatusUseCase(
    orders as any,
    mail as any,
    config as any,
    audit as any,
  );
  return { useCase, orders, mail, config, audit };
}

describe('UpdateOrderStatusUseCase', () => {
  it('lanza NotFoundException si el pedido no existe', async () => {
    const { useCase } = makeUseCase(null);

    await expect(
      useCase.execute(
        'order-1',
        { status: EstadoPedido.CONFIRMADO } as any,
        'admin-1',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rechaza una transicion invalida sin llamar al repositorio', async () => {
    const { useCase, orders } = makeUseCase(makeOrder(EstadoPedido.ENTREGADO));

    await expect(
      useCase.execute(
        'order-1',
        { status: EstadoPedido.CONFIRMADO } as any,
        'admin-1',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(orders.transitionStatus).not.toHaveBeenCalled();
  });

  it('al confirmar (PENDIENTE -> CONFIRMADO) pide aplicar los efectos de confirmacion', async () => {
    const { useCase, orders } = makeUseCase(makeOrder(EstadoPedido.PENDIENTE));

    await useCase.execute(
      'order-1',
      { status: EstadoPedido.CONFIRMADO },
      'admin-1',
    );

    expect(orders.transitionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        statusAnterior: EstadoPedido.PENDIENTE,
        statusNuevo: EstadoPedido.CONFIRMADO,
        aplicarConfirmacion: true,
        revertirConfirmacion: false,
      }),
    );
  });

  it('al cancelar un pedido ya CONFIRMADO, pide revertir la confirmacion', async () => {
    const { useCase, orders } = makeUseCase(makeOrder(EstadoPedido.CONFIRMADO));

    await useCase.execute(
      'order-1',
      { status: EstadoPedido.CANCELADO },
      'admin-1',
    );

    expect(orders.transitionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        aplicarConfirmacion: false,
        revertirConfirmacion: true,
      }),
    );
  });

  it('al cancelar un pedido PENDIENTE, no pide tocar stock ni ventas', async () => {
    const { useCase, orders } = makeUseCase(makeOrder(EstadoPedido.PENDIENTE));

    await useCase.execute(
      'order-1',
      { status: EstadoPedido.CANCELADO },
      'admin-1',
    );

    expect(orders.transitionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        aplicarConfirmacion: false,
        revertirConfirmacion: false,
      }),
    );
  });

  it('registra la transicion en auditoria con el adminId', async () => {
    const { useCase, audit } = makeUseCase(makeOrder(EstadoPedido.CONFIRMADO));

    await useCase.execute(
      'order-1',
      { status: EstadoPedido.EN_CAMINO },
      'admin-1',
    );

    expect(audit.log).toHaveBeenCalledWith(
      'ESTADO',
      'pedido',
      'order-1',
      expect.stringContaining('CONFIRMADO → EN_CAMINO'),
      'admin-1',
    );
  });

  it('no envia email de cambio de estado cuando skipStatusEmail es true', async () => {
    const { useCase, mail } = makeUseCase(makeOrder(EstadoPedido.CONFIRMADO));

    await useCase.execute(
      'order-1',
      { status: EstadoPedido.EN_CAMINO },
      'admin-1',
      true,
    );

    expect(mail.sendOrderStatusUpdate).not.toHaveBeenCalled();
  });

  it('envia email de cambio de estado al cliente cuando no se pide omitirlo', async () => {
    const { useCase, mail } = makeUseCase(makeOrder(EstadoPedido.CONFIRMADO));

    await useCase.execute(
      'order-1',
      { status: EstadoPedido.EN_CAMINO },
      'admin-1',
    );

    expect(mail.sendOrderStatusUpdate).toHaveBeenCalledWith(
      'cliente@test.com',
      'Cliente Test',
      'C3L-20260101-ABCDE',
      EstadoPedido.EN_CAMINO,
    );
  });
});
