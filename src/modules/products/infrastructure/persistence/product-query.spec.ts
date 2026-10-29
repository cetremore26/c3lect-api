import { ProductSortBy, RangoPrecio, SortOrder } from '../../domain/product';
import { buildProductOrderBy, buildProductWhere } from './product-query';

describe('buildProductWhere', () => {
  it('no aplica ningun filtro cuando la query viene vacia', () => {
    expect(buildProductWhere({})).toEqual({});
  });

  it('filtra por categoria, marca y genero sin distinguir mayusculas', () => {
    expect(
      buildProductWhere({
        categoria: 'reloj',
        marca: 'Fossil',
        genero: 'Hombre',
      }),
    ).toEqual({
      cat: { equals: 'reloj', mode: 'insensitive' },
      marca: { equals: 'Fossil', mode: 'insensitive' },
      genero: { equals: 'Hombre', mode: 'insensitive' },
    });
  });

  it('respeta soloDisponibles en false, sin confundirlo con ausente', () => {
    expect(buildProductWhere({ soloDisponibles: false }).disponible).toBe(
      false,
    );
  });

  it('omite el filtro de disponibilidad cuando no se envia', () => {
    expect(buildProductWhere({})).not.toHaveProperty('disponible');
  });

  it('busca productos incompletos por precio, estilo o imagenes vacias', () => {
    expect(buildProductWhere({ incompletos: true }).OR).toEqual([
      { precio: 0 },
      { estilo: '' },
      { imgs: { equals: [] } },
    ]);
  });

  it.each([
    [RangoPrecio.BAJO, { gte: 0, lte: 150 }],
    [RangoPrecio.MEDIO, { gte: 150, lte: 300 }],
    [RangoPrecio.ALTO, { gte: 300 }],
  ])('traduce el rango de precio %s', (rango, esperado) => {
    expect(buildProductWhere({ rangoPrecio: rango }).precio).toEqual(esperado);
  });
});

describe('buildProductOrderBy', () => {
  it('ordena por disponibles primero y luego alfabeticamente por defecto', () => {
    expect(buildProductOrderBy({})).toEqual([
      { disponible: 'desc' },
      { nombre: 'asc' },
    ]);
  });

  it('ordena por precio ascendente cuando no se indica direccion', () => {
    expect(buildProductOrderBy({ sortBy: ProductSortBy.PRECIO })).toEqual([
      { precio: SortOrder.ASC },
    ]);
  });

  it('respeta la direccion descendente', () => {
    expect(
      buildProductOrderBy({
        sortBy: ProductSortBy.PRECIO,
        sortOrder: SortOrder.DESC,
      }),
    ).toEqual([{ precio: 'desc' }]);
  });
});
