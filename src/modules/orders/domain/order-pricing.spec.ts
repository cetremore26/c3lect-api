import { PriceableProduct, priceOrderItems } from './order-pricing';

describe('priceOrderItems', () => {
  const producto: PriceableProduct = {
    id: 'prod-1',
    nombre: 'Rolex Submariner',
    marca: 'Rolex',
    cat: 'relojes',
    precio: 1000,
  };
  const products = new Map([[producto.id, producto]]);

  it('sin precio cotizado, usa el precio de catalogo', () => {
    const result = priceOrderItems(
      [{ productId: 'prod-1', cantidad: 3 }],
      products,
      new Map(),
    );

    expect(result.itemsData[0].precioUnitario).toBe(1000);
    expect(result.itemsData[0].subtotal).toBe(3000);
    expect(result.subtotal).toBe(3000);
    expect(result.total).toBe(3000);
  });

  it('usa el precio final cotizado (con promociones) cuando existe', () => {
    const result = priceOrderItems(
      [{ productId: 'prod-1', cantidad: 2 }],
      products,
      new Map([['prod-1', 800]]),
    );

    expect(result.itemsData[0]).toEqual({
      productId: 'prod-1',
      nombre: 'Rolex Submariner',
      precioUnitario: 800,
      cantidad: 2,
      subtotal: 1600,
    });
    expect(result.total).toBe(1600);
  });
});
