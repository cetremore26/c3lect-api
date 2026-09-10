import { BadRequestException } from '@nestjs/common';
import { PriceableProduct } from '../../domain/order-pricing';
import { ResolveOrderItemsUseCase } from './resolve-order-items.use-case';

// Sin ningun mock de Prisma: los ports son fakes en memoria, lo que era
// imposible cuando esta logica vivia dentro de OrdersService acoplada
// directamente a PrismaService.
function makeUseCase(
  products: Record<string, PriceableProduct>,
  inventario: { id: string; stock: number } | null,
) {
  const catalog = {
    findAvailableByIds: jest
      .fn()
      .mockResolvedValue(new Map(Object.entries(products))),
  };
  const inventory = {
    findByModelo: jest.fn().mockResolvedValue(inventario),
  };
  const promotions = {
    getPromocionesVigentes: jest.fn().mockResolvedValue([]),
  };

  const useCase = new ResolveOrderItemsUseCase(
    catalog,
    inventory,
    promotions as any,
  );
  return { useCase, catalog, inventory };
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

  it('rechaza items cuyo producto no existe o no esta disponible', async () => {
    const { useCase } = makeUseCase({}, null);

    await expect(
      useCase.execute([{ productId: 'prod-inexistente', cantidad: 1 }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza cuando la cantidad pedida supera el stock del inventario maestro', async () => {
    const { useCase } = makeUseCase(
      { 'prod-1': producto },
      { id: 'inv-1', stock: 1 },
    );

    await expect(
      useCase.execute([{ productId: 'prod-1', cantidad: 2 }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('si el producto no esta rastreado en inventario maestro, no bloquea el pedido', async () => {
    const { useCase } = makeUseCase({ 'prod-1': producto }, null);

    await expect(
      useCase.execute([{ productId: 'prod-1', cantidad: 2 }]),
    ).resolves.toBeDefined();
  });
});
