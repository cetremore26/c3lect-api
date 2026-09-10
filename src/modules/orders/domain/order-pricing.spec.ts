import { PriceableProduct, priceOrderItems } from './order-pricing';

describe('priceOrderItems', () => {
  const producto: PriceableProduct = {
    id: 'prod-1',
    nombre: 'Rolex Submariner',
    marca: 'Rolex',
    cat: 'relojes',
    precio: 1000,
  };

  it('calcula precio y subtotal sin promociones', () => {
    const products = new Map([[producto.id, producto]]);

    const result = priceOrderItems(
      [{ productId: 'prod-1', cantidad: 3 }],
      products,
      [],
      false,
    );

    expect(result.itemsData[0].precioUnitario).toBe(1000);
    expect(result.itemsData[0].subtotal).toBe(3000);
    expect(result.subtotal).toBe(3000);
    expect(result.total).toBe(3000);
  });

  it('aplica el mejor descuento vigente que corresponda al producto', () => {
    const products = new Map([[producto.id, producto]]);
    const promocion = {
      alcance: 'PRODUCTO' as const,
      porcentaje: 20,
      productosIncluidos: ['prod-1'],
      categoria: null,
      marca: null,
      excluidos: [],
      soloCuentaActiva: false,
      fechaInicio: new Date('2020-01-01'),
      fechaFin: new Date('2999-01-01'),
      activo: true,
    };

    const result = priceOrderItems(
      [{ productId: 'prod-1', cantidad: 1 }],
      products,
      [promocion],
      false,
    );

    expect(result.itemsData[0].precioUnitario).toBe(800);
    expect(result.total).toBe(800);
  });
});
