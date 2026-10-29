import { ProductsRepository } from './products.repository';

describe('ProductsRepository.findByMarcaModelo', () => {
  type FindManyArgs = { where: { nombre: { equals: string } } };

  function makePrisma(findManyImpl: (args: FindManyArgs) => unknown[]) {
    return { product: { findMany: jest.fn(findManyImpl) } };
  }

  const repoWith = (prisma: unknown) =>
    new ProductsRepository({ client: prisma } as any);

  it('con marca, prueba primero el nombre combinado y devuelve el resultado si hay matches', async () => {
    const combinados = [{ id: '1', nombre: 'Rolex Submariner' }];
    const prisma = makePrisma((args) =>
      args.where.nombre.equals === 'Rolex Submariner' ? combinados : [],
    );

    const result = await repoWith(prisma).findByMarcaModelo(
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

    const result = await repoWith(prisma).findByMarcaModelo(
      'Rolex',
      'Submariner',
    );

    expect(result).toBe(legado);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(2);
  });

  it('sin marca, va directo al legado sin probar el combinado', async () => {
    const legado = [{ id: '1', nombre: 'Submariner' }];
    const prisma = makePrisma(() => legado);

    const result = await repoWith(prisma).findByMarcaModelo(null, 'Submariner');

    expect(result).toBe(legado);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
  });
});
