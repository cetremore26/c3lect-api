import { BadRequestException } from '@nestjs/common';
import { VentasRepository } from './ventas.repository';

function makeTx() {
  return {
    historicalSale: {
      create: jest.fn().mockResolvedValue({ id: 'venta-1' }),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    inventarioMaestro: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'inv-1', modelo: 'Submariner', stock: 5 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'inv-1', stock: 4 }),
      findUnique: jest
        .fn()
        .mockResolvedValue({ modelo: 'Submariner', stock: 4 }),
    },
    product: {
      updateMany: jest.fn(),
    },
  };
}

function makeRepository() {
  const tx = makeTx();
  const prisma = {
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  };
  const repository = new VentasRepository(prisma as any);
  return { repository, tx };
}

const newVenta = {
  fecha: new Date('2026-01-01'),
  cliente: 'Ana',
  celular: '3000000000',
  marca: 'Rolex',
  modelo: 'Submariner',
  estilo: null,
  precioVenta: 1000,
  costoProducto: 600,
  costoEnvio: 0,
  abono: 400,
  saldoPendiente: 600,
  gananciaNeta: 240,
  fuente: 'WhatsApp',
  estado: 'Abonado',
};

describe('VentasRepository.create', () => {
  it('crea la venta y descuenta 1 unidad de stock si el modelo esta rastreado', async () => {
    const { repository, tx } = makeRepository();

    await repository.create(newVenta);

    expect(tx.historicalSale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cliente: 'Ana', abono: 400 }),
      }),
    );
    expect(tx.inventarioMaestro.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', stock: { gte: 1 } },
      data: { stock: { decrement: 1 } },
    });
  });

  it('lanza BadRequestException si el decremento atomico falla (sin stock)', async () => {
    const { repository, tx } = makeRepository();
    tx.inventarioMaestro.updateMany.mockResolvedValue({ count: 0 });

    await expect(repository.create(newVenta)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('si el modelo no esta rastreado en inventario, no toca stock ni lanza', async () => {
    const { repository, tx } = makeRepository();
    tx.inventarioMaestro.findFirst.mockResolvedValue(null);

    await expect(repository.create(newVenta)).resolves.toBeDefined();
    expect(tx.inventarioMaestro.updateMany).not.toHaveBeenCalled();
  });

  it('si el stock llega a 0, deshabilita las variantes del producto', async () => {
    const { repository, tx } = makeRepository();
    tx.inventarioMaestro.findUniqueOrThrow.mockResolvedValue({
      id: 'inv-1',
      stock: 0,
    });

    await repository.create(newVenta);

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        nombre: { equals: 'Rolex Submariner', mode: 'insensitive' },
        disponible: true,
      },
      data: { disponible: false },
    });
  });

  it('si queda stock, no toca disponibilidad del producto', async () => {
    const { repository, tx } = makeRepository();
    tx.inventarioMaestro.findUniqueOrThrow.mockResolvedValue({
      id: 'inv-1',
      stock: 4,
    });

    await repository.create(newVenta);

    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});

describe('VentasRepository.remove', () => {
  it('devuelve la unidad al inventario', async () => {
    const { repository, tx } = makeRepository();

    await repository.remove('venta-1', {
      marca: 'Rolex',
      modelo: 'Submariner',
    });

    expect(tx.historicalSale.delete).toHaveBeenCalledWith({
      where: { id: 'venta-1' },
    });
    expect(tx.inventarioMaestro.updateMany).toHaveBeenCalledWith({
      where: { modelo: 'Submariner' },
      data: { stock: { increment: 1 } },
    });
  });

  it('si el stock vuelve a ser positivo, re-habilita las variantes', async () => {
    const { repository, tx } = makeRepository();
    tx.inventarioMaestro.findUnique.mockResolvedValue({
      modelo: 'Submariner',
      stock: 1,
    });

    await repository.remove('venta-1', {
      marca: 'Rolex',
      modelo: 'Submariner',
    });

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        nombre: { equals: 'Rolex Submariner', mode: 'insensitive' },
        disponible: false,
      },
      data: { disponible: true },
    });
  });

  it('si el modelo no esta en inventario, no intenta re-habilitar nada', async () => {
    const { repository, tx } = makeRepository();
    tx.inventarioMaestro.findUnique.mockResolvedValue(null);

    await repository.remove('venta-1', {
      marca: 'Rolex',
      modelo: 'Submariner',
    });

    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});
