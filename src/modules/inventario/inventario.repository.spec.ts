import { InventarioRepository } from './inventario.repository';

describe('InventarioRepository.applySeed', () => {
  function makeTx() {
    return {
      inventarioMaestro: {
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
      precioProducto: {
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
    };
  }

  function makeRepository() {
    const tx = makeTx();
    const prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const repository = new InventarioRepository(prisma as any);
    return { repository, tx, prisma };
  }

  const fila = {
    modelo: 'Submariner',
    marca: 'Rolex',
    stock: 3,
    costoUnitario: 600,
    categoria: 'Reloj',
    costoTotal: 625028,
    costoAdicional: 25028,
  };

  it('borra las entradas huerfanas de InventarioMaestro y PrecioProducto (esta ultima solo sin precios manuales)', async () => {
    const { repository, tx } = makeRepository();

    await repository.applySeed(['Submariner'], [fila]);

    expect(tx.inventarioMaestro.deleteMany).toHaveBeenCalledWith({
      where: { modelo: { notIn: ['Submariner'] } },
    });
    expect(tx.precioProducto.deleteMany).toHaveBeenCalledWith({
      where: {
        modelo: { notIn: ['Submariner'] },
        precioPublico: null,
        precioCierre: null,
      },
    });
  });

  it('hace upsert de InventarioMaestro con los datos de la fila', async () => {
    const { repository, tx } = makeRepository();

    await repository.applySeed(['Submariner'], [fila]);

    expect(tx.inventarioMaestro.upsert).toHaveBeenCalledWith({
      where: { modelo: 'Submariner' },
      update: {
        marca: 'Rolex',
        stock: 3,
        costoUnitario: 600,
        categoria: 'Reloj',
      },
      create: {
        marca: 'Rolex',
        modelo: 'Submariner',
        stock: 3,
        costoUnitario: 600,
        categoria: 'Reloj',
      },
    });
  });

  it('hace upsert de PrecioProducto incluyendo costoAdicional solo en el create', async () => {
    const { repository, tx } = makeRepository();

    await repository.applySeed(['Submariner'], [fila]);

    expect(tx.precioProducto.upsert).toHaveBeenCalledWith({
      where: { modelo: 'Submariner' },
      update: { marca: 'Rolex', costoUnitario: 600, costoTotal: 625028 },
      create: {
        marca: 'Rolex',
        modelo: 'Submariner',
        costoUnitario: 600,
        costoAdicional: 25028,
        costoTotal: 625028,
      },
    });
  });

  it('devuelve la cantidad de filas procesadas', async () => {
    const { repository } = makeRepository();
    const otraFila = { ...fila, modelo: 'G-Shock' };

    const count = await repository.applySeed(
      ['Submariner', 'G-Shock'],
      [fila, otraFila],
    );

    expect(count).toBe(2);
  });

  it('corre todo dentro de una transaccion con timeout extendido', async () => {
    const { repository, prisma } = makeRepository();

    await repository.applySeed(['Submariner'], [fila]);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 15000,
    });
  });
});
