import { BadRequestException } from '@nestjs/common';
import { EstadoPedido } from '@prisma/client';
import { buildOrderNumber, OrdersService } from './orders.service';

describe('buildOrderNumber', () => {
  it('genera un orderNumber con el formato C3L-YYYYMMDD-XXXXX', () => {
    expect(buildOrderNumber()).toMatch(/^C3L-\d{8}-[A-Z0-9]{5}$/);
  });

  it('no repite el mismo sufijo en llamadas consecutivas (aleatoriedad real)', () => {
    const suffixes = new Set(
      Array.from({ length: 20 }, () => buildOrderNumber().split('-')[2]),
    );
    expect(suffixes.size).toBeGreaterThan(1);
  });
});

describe('OrdersService.updateStatus', () => {
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

  function makeTx() {
    return {
      order: { update: jest.fn() },
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

  function makeService(order: Record<string, unknown>) {
    const tx = makeTx();
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const mail = { sendOrderStatusUpdate: jest.fn() };
    const config = { get: jest.fn() };
    const audit = { log: jest.fn() };
    const promotions = { getPromocionesVigentes: jest.fn().mockResolvedValue([]) };

    const service = new OrdersService(
      prisma as any,
      mail as any,
      config as any,
      audit as any,
      promotions as any,
    );
    return { service, prisma, tx, mail, audit };
  }

  function makeOrder(
    status: EstadoPedido,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id: 'order-1',
      orderNumber: 'C3L-20260101-ABCDE',
      status,
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

  const casosInvalidos: [EstadoPedido, EstadoPedido][] = [
    [EstadoPedido.PENDIENTE, EstadoPedido.EN_CAMINO],
    [EstadoPedido.PENDIENTE, EstadoPedido.ENTREGADO],
    [EstadoPedido.CONFIRMADO, EstadoPedido.PENDIENTE],
    [EstadoPedido.CONFIRMADO, EstadoPedido.ENTREGADO],
    [EstadoPedido.EN_CAMINO, EstadoPedido.PENDIENTE],
    [EstadoPedido.EN_CAMINO, EstadoPedido.CONFIRMADO],
    [EstadoPedido.ENTREGADO, EstadoPedido.CANCELADO],
    [EstadoPedido.ENTREGADO, EstadoPedido.CONFIRMADO],
    [EstadoPedido.CANCELADO, EstadoPedido.CONFIRMADO],
    [EstadoPedido.CANCELADO, EstadoPedido.PENDIENTE],
  ];

  it.each(casosInvalidos)(
    'rechaza la transicion %s -> %s',
    async (desde, hacia) => {
      const { service, prisma } = makeService(makeOrder(desde));

      await expect(
        service.updateStatus('order-1', { status: hacia } as any, 'admin-1'),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  const casosValidos: [EstadoPedido, EstadoPedido][] = [
    [EstadoPedido.PENDIENTE, EstadoPedido.CONFIRMADO],
    [EstadoPedido.PENDIENTE, EstadoPedido.CANCELADO],
    [EstadoPedido.CONFIRMADO, EstadoPedido.EN_CAMINO],
    [EstadoPedido.CONFIRMADO, EstadoPedido.CANCELADO],
    [EstadoPedido.EN_CAMINO, EstadoPedido.ENTREGADO],
    [EstadoPedido.EN_CAMINO, EstadoPedido.CANCELADO],
  ];

  it.each(casosValidos)(
    'acepta la transicion %s -> %s',
    async (desde, hacia) => {
      const { service, prisma } = makeService(makeOrder(desde));

      await expect(
        service.updateStatus('order-1', { status: hacia } as any, 'admin-1'),
      ).resolves.toEqual({ message: `Pedido actualizado a ${hacia}.` });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    },
  );

  it('al confirmar (PENDIENTE -> CONFIRMADO) descuenta stock y registra la venta', async () => {
    const { service, tx } = makeService(makeOrder(EstadoPedido.PENDIENTE));

    await service.updateStatus(
      'order-1',
      { status: EstadoPedido.CONFIRMADO },
      'admin-1',
    );

    expect(tx.inventarioMaestro.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', stock: { gte: itemBase.cantidad } },
      data: { stock: { decrement: itemBase.cantidad } },
    });
    expect(tx.historicalSale.createMany).toHaveBeenCalledTimes(1);
    const ventaArgs = tx.historicalSale.createMany.mock.calls[0][0];
    expect(ventaArgs.data).toHaveLength(itemBase.cantidad);
  });

  it('si el stock ya no alcanza al confirmar, lanza BadRequestException y no registra la venta', async () => {
    const { service, tx } = makeService(makeOrder(EstadoPedido.PENDIENTE));
    tx.inventarioMaestro.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateStatus(
        'order-1',
        { status: EstadoPedido.CONFIRMADO } as any,
        'admin-1',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tx.historicalSale.createMany).not.toHaveBeenCalled();
  });

  it('al cancelar un pedido ya CONFIRMADO, devuelve el stock reservado', async () => {
    const { service, tx } = makeService(makeOrder(EstadoPedido.CONFIRMADO));

    await service.updateStatus(
      'order-1',
      { status: EstadoPedido.CANCELADO },
      'admin-1',
    );

    expect(tx.historicalSale.deleteMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
    });
    expect(tx.inventarioMaestro.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { stock: inventarioBase.stock + itemBase.cantidad },
    });
  });

  it('al cancelar un pedido PENDIENTE (nunca confirmado), no toca stock ni ventas', async () => {
    const { service, tx } = makeService(makeOrder(EstadoPedido.PENDIENTE));

    await service.updateStatus(
      'order-1',
      { status: EstadoPedido.CANCELADO },
      'admin-1',
    );

    expect(tx.historicalSale.deleteMany).not.toHaveBeenCalled();
    expect(tx.inventarioMaestro.update).not.toHaveBeenCalled();
  });

  it('registra la transicion en auditoria con el adminId', async () => {
    const { service, audit } = makeService(makeOrder(EstadoPedido.CONFIRMADO));

    await service.updateStatus(
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
    const { service, mail } = makeService(makeOrder(EstadoPedido.CONFIRMADO));

    await service.updateStatus(
      'order-1',
      { status: EstadoPedido.EN_CAMINO },
      'admin-1',
      true,
    );

    expect(mail.sendOrderStatusUpdate).not.toHaveBeenCalled();
  });
});

describe('OrdersService.resolveItems', () => {
  function makeService(
    products: Record<string, unknown>[],
    inventario: Record<string, unknown> | null,
  ) {
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue(products) },
      inventarioMaestro: { findFirst: jest.fn().mockResolvedValue(inventario) },
    };
    const promotions = { getPromocionesVigentes: jest.fn().mockResolvedValue([]) };
    const service = new OrdersService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      promotions as any,
    );
    return { service, prisma };
  }

  const producto = {
    id: 'prod-1',
    nombre: 'Rolex Submariner',
    marca: 'Rolex',
    precio: 1000,
  };

  it('calcula precios y subtotal server-side a partir del catalogo, no del cliente', async () => {
    const { service } = makeService([producto], {
      id: 'inv-1',
      modelo: 'Submariner',
      stock: 10,
    });

    const result = await service.resolveItems([
      { productId: 'prod-1', cantidad: 3 },
    ]);

    expect(result.itemsData[0].precioUnitario).toBe(1000);
    expect(result.itemsData[0].subtotal).toBe(3000);
    expect(result.subtotal).toBe(3000);
    expect(result.total).toBe(3000);
  });

  it('rechaza items cuyo producto no existe o no esta disponible', async () => {
    const { service } = makeService([], null);

    await expect(
      service.resolveItems([{ productId: 'prod-inexistente', cantidad: 1 }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza cuando la cantidad pedida supera el stock del inventario maestro', async () => {
    const { service } = makeService([producto], {
      id: 'inv-1',
      modelo: 'Submariner',
      stock: 1,
    });

    await expect(
      service.resolveItems([{ productId: 'prod-1', cantidad: 2 }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('si el producto no esta rastreado en inventario maestro, no bloquea el pedido', async () => {
    const { service } = makeService([producto], null);

    await expect(
      service.resolveItems([{ productId: 'prod-1', cantidad: 2 }]),
    ).resolves.toBeDefined();
  });
});
