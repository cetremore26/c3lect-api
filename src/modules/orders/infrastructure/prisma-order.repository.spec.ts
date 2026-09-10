import { BadRequestException } from '@nestjs/common';
import { EstadoPedido } from '@prisma/client';
import { PrismaOrderRepository } from './prisma-order.repository';

// Esta suite SI mockea el shape de Prisma.TransactionClient a proposito: es
// la unica pieza del modulo orders cuyo trabajo es hablar con Prisma, asi
// que sus tests son, por diseno, tests de integracion con esa forma. La
// logica de decision (que transicion es valida, cuando aplican los efectos
// de confirmacion) ya se prueba sin Prisma en
// application/use-cases/update-order-status.use-case.spec.ts.
describe('PrismaOrderRepository.transitionStatus', () => {
  const productoBase = {
    id: 'prod-1',
    nombre: 'Rolex Submariner',
    marca: 'Rolex',
  };
  const itemBase = {
    productId: 'prod-1',
    nombre: 'Rolex Submariner',
    cantidad: 2,
    precioUnitario: 1000,
  };
  const inventarioBase = {
    id: 'inv-1',
    modelo: 'Submariner',
    stock: 5,
    costoUnitario: 600,
  };

  function makeTx(orderAfterUpdate: Record<string, unknown>) {
    return {
      order: {
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(orderAfterUpdate),
      },
      orderStatusHistory: { create: jest.fn() },
      product: {
        findMany: jest.fn().mockResolvedValue([productoBase]),
        updateMany: jest.fn(),
      },
      inventarioMaestro: {
        findFirst: jest.fn().mockResolvedValue(inventarioBase),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...inventarioBase, stock: 3 }),
        update: jest.fn(),
      },
      historicalSale: {
        createMany: jest.fn<unknown, [{ data: unknown[] }]>(),
        deleteMany: jest.fn(),
      },
    };
  }

  function makeRepository(orderAfterUpdate: Record<string, unknown>) {
    const tx = makeTx(orderAfterUpdate);
    const prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const repository = new PrismaOrderRepository(prisma as any);
    return { repository, tx };
  }

  function orderFixture(overrides: Record<string, unknown> = {}) {
    return {
      id: 'order-1',
      orderNumber: 'C3L-20260101-ABCDE',
      items: [itemBase],
      shippingInfo: {
        email: 'cliente@test.com',
        nombreCompleto: 'Cliente Test',
        telefono: '3000000000',
      },
      user: null,
      ...overrides,
    };
  }

  it('al confirmar, descuenta stock y registra la venta', async () => {
    const { repository, tx } = makeRepository(orderFixture());

    await repository.transitionStatus({
      orderId: 'order-1',
      statusAnterior: EstadoPedido.PENDIENTE,
      statusNuevo: EstadoPedido.CONFIRMADO,
      changedBy: 'admin-1',
      aplicarConfirmacion: true,
      revertirConfirmacion: false,
    });

    expect(tx.inventarioMaestro.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', stock: { gte: itemBase.cantidad } },
      data: { stock: { decrement: itemBase.cantidad } },
    });
    expect(tx.historicalSale.createMany).toHaveBeenCalledTimes(1);
    const ventaArgs = tx.historicalSale.createMany.mock.calls[0][0];
    expect(ventaArgs.data).toHaveLength(itemBase.cantidad);
  });

  it('si el stock ya no alcanza al confirmar, lanza BadRequestException y no registra la venta', async () => {
    const { repository, tx } = makeRepository(orderFixture());
    tx.inventarioMaestro.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.transitionStatus({
        orderId: 'order-1',
        statusAnterior: EstadoPedido.PENDIENTE,
        statusNuevo: EstadoPedido.CONFIRMADO,
        changedBy: 'admin-1',
        aplicarConfirmacion: true,
        revertirConfirmacion: false,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.historicalSale.createMany).not.toHaveBeenCalled();
  });

  it('al revertir una confirmacion, devuelve el stock reservado y borra las ventas', async () => {
    const { repository, tx } = makeRepository(orderFixture());

    await repository.transitionStatus({
      orderId: 'order-1',
      statusAnterior: EstadoPedido.CONFIRMADO,
      statusNuevo: EstadoPedido.CANCELADO,
      changedBy: 'admin-1',
      aplicarConfirmacion: false,
      revertirConfirmacion: true,
    });

    expect(tx.historicalSale.deleteMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
    });
    expect(tx.inventarioMaestro.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { stock: inventarioBase.stock + itemBase.cantidad },
    });
  });

  it('sin flags de confirmacion/reversion, no toca stock ni ventas', async () => {
    const { repository, tx } = makeRepository(orderFixture());

    await repository.transitionStatus({
      orderId: 'order-1',
      statusAnterior: EstadoPedido.PENDIENTE,
      statusNuevo: EstadoPedido.CANCELADO,
      changedBy: 'admin-1',
      aplicarConfirmacion: false,
      revertirConfirmacion: false,
    });

    expect(tx.historicalSale.deleteMany).not.toHaveBeenCalled();
    expect(tx.inventarioMaestro.update).not.toHaveBeenCalled();
    expect(tx.inventarioMaestro.updateMany).not.toHaveBeenCalled();
  });
});
