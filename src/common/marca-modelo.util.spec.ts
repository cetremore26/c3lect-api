import {
  combineMarcaModelo,
  deriveMarcaModeloFromProduct,
  findProductsByMarcaModelo,
} from './marca-modelo.util';

describe('combineMarcaModelo', () => {
  it('une marca y modelo con un solo espacio', () => {
    expect(combineMarcaModelo('Rolex', 'Submariner')).toBe('Rolex Submariner');
  });

  it('recorta espacios sobrantes y colapsa espacios internos duplicados', () => {
    expect(combineMarcaModelo('  Rolex  ', '  Submariner  Date ')).toBe(
      'Rolex Submariner Date',
    );
  });

  it('sin marca, devuelve solo el modelo (comportamiento legado)', () => {
    expect(combineMarcaModelo(null, 'Submariner')).toBe('Submariner');
    expect(combineMarcaModelo(undefined, 'Submariner')).toBe('Submariner');
    expect(combineMarcaModelo('', 'Submariner')).toBe('Submariner');
  });
});

describe('deriveMarcaModeloFromProduct', () => {
  it('separa marca y modelo cuando marca es prefijo del nombre', () => {
    expect(
      deriveMarcaModeloFromProduct({
        nombre: 'Rolex Submariner',
        marca: 'Rolex',
      }),
    ).toEqual({ marca: 'Rolex', modelo: 'Submariner' });
  });

  it('compara sin distinguir mayusculas/minusculas', () => {
    expect(
      deriveMarcaModeloFromProduct({
        nombre: 'rolex Submariner',
        marca: 'Rolex',
      }),
    ).toEqual({ marca: 'Rolex', modelo: 'Submariner' });
  });

  it('cae al comportamiento legado (todo como modelo) si marca es null', () => {
    expect(
      deriveMarcaModeloFromProduct({ nombre: 'Submariner', marca: null }),
    ).toEqual({ marca: null, modelo: 'Submariner' });
  });

  it('cae al comportamiento legado si marca no es prefijo del nombre', () => {
    expect(
      deriveMarcaModeloFromProduct({ nombre: 'Submariner', marca: 'Rolex' }),
    ).toEqual({ marca: null, modelo: 'Submariner' });
  });

  it('cae al comportamiento legado si el nombre es exactamente igual a la marca (sin resto)', () => {
    expect(
      deriveMarcaModeloFromProduct({ nombre: 'Rolex', marca: 'Rolex' }),
    ).toEqual({ marca: null, modelo: 'Rolex' });
  });
});

describe('findProductsByMarcaModelo', () => {
  type FindManyArgs = { where: { nombre: { equals: string } } };

  function makePrisma(findManyImpl: (args: FindManyArgs) => unknown[]) {
    return { product: { findMany: jest.fn(findManyImpl) } };
  }

  it('con marca, prueba primero el nombre combinado y devuelve el resultado si hay matches', async () => {
    const combinados = [{ id: '1', nombre: 'Rolex Submariner' }];
    const prisma = makePrisma((args) =>
      args.where.nombre.equals === 'Rolex Submariner' ? combinados : [],
    );

    const result = await findProductsByMarcaModelo(
      prisma as any,
      'Rolex',
      'Submariner',
    );

    expect(result).toBe(combinados);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
  });

  it('si el combinado no tiene matches, cae al legado (nombre === modelo)', async () => {
    const legado = [{ id: '1', nombre: 'Submariner' }];
    const prisma = makePrisma((args) =>
      args.where.nombre.equals === 'Submariner' ? legado : [],
    );

    const result = await findProductsByMarcaModelo(
      prisma as any,
      'Rolex',
      'Submariner',
    );

    expect(result).toBe(legado);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(2);
  });

  it('sin marca, va directo al legado sin probar el combinado', async () => {
    const legado = [{ id: '1', nombre: 'Submariner' }];
    const prisma = makePrisma(() => legado);

    const result = await findProductsByMarcaModelo(
      prisma as any,
      null,
      'Submariner',
    );

    expect(result).toBe(legado);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
  });
});
