import { ComprasRepository } from './compras.repository';

function makeTx() {
  return {
    purchase: {
      create: jest.fn().mockResolvedValue({ id: 'compra-1' }),
      update: jest.fn().mockResolvedValue({ id: 'compra-1' }),
    },
    inventarioMaestro: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest
        .fn()
        .mockResolvedValue({ modelo: 'Submariner', stock: 5 }),
    },
    precioProducto: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function makeRepository() {
  const tx = makeTx();
  const prisma = {
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  };
  const repository = new ComprasRepository(prisma as any);
  return { repository, tx };
}

const newCompra = {
  fecha: new Date('2026-01-01'),
  marca: 'Rolex',
  modelo: 'Submariner',
  cantidad: 5,
  costoUnitario: 900,
  costoTotal: 4500,
  categoria: 'Reloj',
};

describe('ComprasRepository.create', () => {
  it('crea la compra y suma stock en InventarioMaestro', async () => {
    const { repository, tx } = makeRepository();

    await repository.create(newCompra);

    expect(tx.purchase.create).toHaveBeenCalledWith({
      data: {
        fecha: newCompra.fecha,
        marca: 'Rolex',
        modelo: 'Submariner',
        cantidad: 5,
        costoUnitario: 900,
        costoTotal: 4500,
        categoria: 'Reloj',
      },
    });
    expect(tx.inventarioMaestro.upsert).toHaveBeenCalledWith({
      where: { modelo: 'Submariner' },
      update: {
        marca: 'Rolex',
        stock: { increment: 5 },
        costoUnitario: 900,
        categoria: 'Reloj',
      },
      create: {
        marca: 'Rolex',
        modelo: 'Submariner',
        stock: 5,
        costoUnitario: 900,
        categoria: 'Reloj',
      },
    });
  });

  it('crea PrecioProducto solo si el modelo no tenia precio todavia', async () => {
    const { repository, tx } = makeRepository();
    tx.precioProducto.findUnique.mockResolvedValue(null);

    await repository.create(newCompra);

    expect(tx.precioProducto.create).toHaveBeenCalledWith({
      data: {
        marca: 'Rolex',
        modelo: 'Submariner',
        costoUnitario: 900,
        costoAdicional: 25028,
        costoTotal: 25928,
      },
    });
  });

  it('no toca PrecioProducto si ya existia para ese modelo', async () => {
    const { repository, tx } = makeRepository();
    tx.precioProducto.findUnique.mockResolvedValue({
      modelo: 'Submariner',
      costoAdicional: 25028,
    });

    await repository.create(newCompra);

    expect(tx.precioProducto.create).not.toHaveBeenCalled();
  });

  it('crea un producto stub si hay stock y no existe ninguna variante', async () => {
    const { repository, tx } = makeRepository();
    tx.product.findMany.mockResolvedValue([]);

    await repository.create(newCompra);

    expect(tx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'r-rolex-submariner',
          disponible: false,
        }),
      }),
    );
  });

  it('no crea producto si no hay stock disponible', async () => {
    const { repository, tx } = makeRepository();
    tx.inventarioMaestro.findUnique.mockResolvedValue({
      modelo: 'Submariner',
      stock: 0,
    });

    await repository.create(newCompra);

    expect(tx.product.create).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('habilita variantes deshabilitadas si ya existe el producto', async () => {
    const { repository, tx } = makeRepository();
    tx.product.findMany.mockResolvedValue([
      { id: 'r-rolex-submariner', disponible: false, marca: 'Rolex' },
    ]);

    await repository.create(newCompra);

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r-rolex-submariner'] } },
      data: { disponible: true },
    });
  });
});

describe('ComprasRepository.update', () => {
  const existing = {
    fecha: new Date('2026-01-01'),
    marca: 'Rolex',
    modelo: 'Submariner',
    cantidad: 5,
    costoUnitario: 900,
    categoria: 'Reloj',
  };

  it('sin cambio de modelo, ajusta el stock por la diferencia', async () => {
    const { repository, tx } = makeRepository();
    const plan = {
      fecha: existing.fecha,
      marca: 'Rolex',
      modelo: 'Submariner',
      cantidad: 8,
      costoUnitario: 900,
      costoTotal: 7200,
      categoria: 'Reloj',
      modeloCambio: false,
      identidadCambio: false,
      actualizarPrecio: false,
    };

    await repository.update('compra-1', existing, plan);

    expect(tx.inventarioMaestro.updateMany).toHaveBeenCalledWith({
      where: { modelo: 'Submariner' },
      data: {
        marca: 'Rolex',
        stock: { increment: 3 },
        costoUnitario: 900,
        categoria: 'Reloj',
      },
    });
  });

  it('con cambio de modelo, descuenta del modelo viejo y suma al nuevo', async () => {
    const { repository, tx } = makeRepository();
    const plan = {
      fecha: existing.fecha,
      marca: 'Rolex',
      modelo: 'GMT-Master',
      cantidad: 5,
      costoUnitario: 900,
      costoTotal: 4500,
      categoria: 'Reloj',
      modeloCambio: true,
      identidadCambio: true,
      actualizarPrecio: true,
    };

    await repository.update('compra-1', existing, plan);

    expect(tx.inventarioMaestro.updateMany).toHaveBeenCalledWith({
      where: { modelo: 'Submariner' },
      data: { stock: { decrement: 5 } },
    });
    expect(tx.inventarioMaestro.upsert).toHaveBeenCalledWith({
      where: { modelo: 'GMT-Master' },
      update: {
        marca: 'Rolex',
        stock: { increment: 5 },
        costoUnitario: 900,
        categoria: 'Reloj',
      },
      create: {
        marca: 'Rolex',
        modelo: 'GMT-Master',
        stock: 5,
        costoUnitario: 900,
        categoria: 'Reloj',
      },
    });
  });

  it('actualizarPrecio con precio existente lo actualiza sin tocar costoAdicional', async () => {
    const { repository, tx } = makeRepository();
    tx.precioProducto.findUnique.mockResolvedValue({
      modelo: 'Submariner',
      costoAdicional: 25028,
    });
    const plan = {
      fecha: existing.fecha,
      marca: 'Rolex',
      modelo: 'Submariner',
      cantidad: 5,
      costoUnitario: 950,
      costoTotal: 4750,
      categoria: 'Reloj',
      modeloCambio: false,
      identidadCambio: false,
      actualizarPrecio: true,
    };

    await repository.update('compra-1', existing, plan);

    expect(tx.precioProducto.update).toHaveBeenCalledWith({
      where: { modelo: 'Submariner' },
      data: {
        marca: 'Rolex',
        modelo: 'Submariner',
        costoUnitario: 950,
        costoTotal: 950 + 25028,
      },
    });
  });

  it('identidadCambio renombra el producto existente en vez de crear uno nuevo', async () => {
    const { repository, tx } = makeRepository();
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    const plan = {
      fecha: existing.fecha,
      marca: 'Tudor',
      modelo: 'Submariner',
      cantidad: 5,
      costoUnitario: 900,
      costoTotal: 4500,
      categoria: 'Reloj',
      modeloCambio: false,
      identidadCambio: true,
      actualizarPrecio: true,
    };

    await repository.update('compra-1', existing, plan);

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { nombre: { equals: 'Rolex Submariner', mode: 'insensitive' } },
      data: { nombre: 'Tudor Submariner', marca: 'Tudor' },
    });
    // Al renombrar con exito (count > 0), no debe intentar sincronizar/crear un stub aparte
    expect(tx.product.create).not.toHaveBeenCalled();
  });

  it('identidadCambio sin nada que renombrar, cae a syncProducto', async () => {
    const { repository, tx } = makeRepository();
    tx.product.updateMany.mockResolvedValueOnce({ count: 0 }); // el rename no encuentra nada
    tx.product.findMany.mockResolvedValue([]); // syncProducto tampoco encuentra variantes
    const plan = {
      fecha: existing.fecha,
      marca: 'Tudor',
      modelo: 'Submariner',
      cantidad: 5,
      costoUnitario: 900,
      costoTotal: 4500,
      categoria: 'Reloj',
      modeloCambio: false,
      identidadCambio: true,
      actualizarPrecio: true,
    };

    await repository.update('compra-1', existing, plan);

    expect(tx.product.create).toHaveBeenCalled();
  });
});
