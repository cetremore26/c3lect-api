import { buildProductId, slugify } from './product-id';

describe('slugify', () => {
  it('normaliza tildes, espacios y caracteres especiales', () => {
    expect(slugify('Rolex Submariner (Ñ)')).toBe('rolex-submariner-n');
  });
});

describe('buildProductId', () => {
  it('arma id con prefijo por categoria + marca + modelo', () => {
    expect(buildProductId('reloj', 'Curren', '8442 Blue White')).toBe(
      'r-curren-8442-blue-white',
    );
  });

  it('incluye el estilo cuando viene', () => {
    expect(buildProductId('perfume', 'Lattafa', 'Yara', 'EDP')).toBe(
      'p-lattafa-yara-edp',
    );
  });

  it('sin marca, arma el id solo con el modelo', () => {
    expect(buildProductId('accesorio', null, 'Organizador')).toBe(
      'a-organizador',
    );
  });
});
