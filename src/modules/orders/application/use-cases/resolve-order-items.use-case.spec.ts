import { BusinessRuleViolation } from '../../../../shared/domain/domain-error';
import { PriceableProduct } from '../../domain/order-pricing';
import { ResolveOrderItemsUseCase } from './resolve-order-items.use-case';

type Fila = { id: string; stock: number } | null;

// Sin ningun mock de Prisma: los ports son fakes en memoria.
function makeUseCase(
  products: Record<string, PriceableProduct>,
  fila: Fila | ((modelo: string) => Fila),
  precios: Map<string, number> = new Map(),
) {
  const catalog = {
    findAvailableByIds: jest
      .fn()
      .mockResolvedValue(new Map(Object.entries(products))),
    findByIds: jest.fn(),
  };
  const inventory = {
    filaDeStock:
      typeof fila === 'function'
        ? jest.fn((modelo: string) => Promise.resolve(fila(modelo)))
        : jest.fn().mockResolvedValue(fila),
  };
  const prices = { preciosFinales: jest.fn().mockResolvedValue(precios) };

  const useCase = new ResolveOrderItemsUseCase(catalog, inventory, prices);
  return { useCase, catalog, inventory, prices };
}

const producto: PriceableProduct = {
  id: 'prod-1',
  nombre: 'Rolex Submariner',
  marca: 'Rolex',
  cat: 'relojes',
  precio: 1000,
};

describe('ResolveOrderItemsUseCase', () => {
  it('calcula precios y subtotal server-side a partir del catalogo, no del cliente', async () => {
    const { useCase } = makeUseCase(
      { 'prod-1': producto },
      { id: 'inv-1', stock: 10 },
    );

    const result = await useCase.execute([
      { productId: 'prod-1', cantidad: 3 },
    ]);

    expect(result.itemsData[0].precioUnitario).toBe(1000);
    expect(result.itemsData[0].subtotal).toBe(3000);
    expect(result.subtotal).toBe(3000);
    expect(result.total).toBe(3000);
  });

  it('usa el precio que cotiza promociones y le pasa si el comprador esta autenticado', async () => {
    const { useCase, prices } = makeUseCase(
      { 'prod-1': producto },
      { id: 'inv-1', stock: 10 },
      new Map([['prod-1', 800]]),
    );

    const result = await useCase.execute(
      [{ productId: 'prod-1', cantidad: 1 }],
      true,
    );

    expect(prices.preciosFinales).toHaveBeenCalledWith([producto], true);
    expect(result.total).toBe(800);
  });

  it('rechaza items cuyo producto no existe o no esta disponible', async () => {
    const { useCase } = makeUseCase({}, null);

    await expect(
      useCase.execute([{ productId: 'prod-inexistente', cantidad: 1 }]),
    ).rejects.toThrow(BusinessRuleViolation);
  });

  it('rechaza cuando la cantidad pedida supera el stock del inventario maestro', async () => {
    const { useCase, inventory } = makeUseCase(
      { 'prod-1': producto },
      {
        id: 'inv-1',
        stock: 1,
      },
    );

    await expect(
      useCase.execute([{ productId: 'prod-1', cantidad: 2 }]),
    ).rejects.toThrow(BusinessRuleViolation);
    // consulta por el modelo derivado y el nombre completo como fallback legado
    expect(inventory.filaDeStock).toHaveBeenCalledWith(
      'Submariner',
      'Rolex Submariner',
    );
  });

  it('si el producto no esta rastreado en inventario maestro, no bloquea el pedido', async () => {
    const { useCase } = makeUseCase({ 'prod-1': producto }, null);

    await expect(
      useCase.execute([{ productId: 'prod-1', cantidad: 2 }]),
    ).resolves.toBeDefined();
  });

  describe('stock por fila de inventario', () => {
    const otro: PriceableProduct = {
      id: 'prod-2',
      nombre: 'Rolex Submariner Date',
      marca: 'Rolex',
      cat: 'relojes',
      precio: 1200,
    };

    it('dos productos que comparten la misma fila de inventario suman sus cantidades', async () => {
      const { useCase } = makeUseCase(
        { 'prod-1': producto, 'prod-2': otro },
        { id: 'inv-1', stock: 3 },
      );

      await expect(
        useCase.execute([
          { productId: 'prod-1', cantidad: 2 },
          { productId: 'prod-2', cantidad: 2 },
        ]),
      ).rejects.toThrow('solicitado: 4');
    });

    it('con stock suficiente para la suma, pasa', async () => {
      const { useCase } = makeUseCase(
        { 'prod-1': producto, 'prod-2': otro },
        { id: 'inv-1', stock: 4 },
      );

      await expect(
        useCase.execute([
          { productId: 'prod-1', cantidad: 2 },
          { productId: 'prod-2', cantidad: 2 },
        ]),
      ).resolves.toBeDefined();
    });

    it('fusiona productId repetidos en una sola linea y verifica la suma', async () => {
      const items = [
        { productId: 'prod-1', cantidad: 1 },
        { productId: 'prod-1', cantidad: 2 },
      ];
      const ok = makeUseCase({ 'prod-1': producto }, { id: 'inv-1', stock: 3 });
      const result = await ok.useCase.execute(items);
      expect(result.itemsData).toHaveLength(1);
      expect(result.itemsData[0].cantidad).toBe(3);

      const corto = makeUseCase(
        { 'prod-1': producto },
        { id: 'inv-1', stock: 2 },
      );
      await expect(corto.useCase.execute(items)).rejects.toThrow(
        BusinessRuleViolation,
      );
    });
  });
});
