import {
  combineMarcaModelo,
  deriveMarcaModeloFromProduct,
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
