import {
  CATEGORIA_CAPITALIZADA,
  categoriaDesdeCapitalizada,
  clasificarModelo,
} from './categoria.util';

describe('categoriaDesdeCapitalizada', () => {
  it('resuelve cada valor capitalizado a su categoria en minuscula', () => {
    expect(categoriaDesdeCapitalizada('Reloj')).toBe('reloj');
    expect(categoriaDesdeCapitalizada('Perfume')).toBe('perfume');
    expect(categoriaDesdeCapitalizada('Accesorio')).toBe('accesorio');
  });

  it('cae a "reloj" cuando el texto no coincide con ninguna categoria', () => {
    expect(categoriaDesdeCapitalizada('Bolso')).toBe('reloj');
    expect(categoriaDesdeCapitalizada('')).toBe('reloj');
  });

  it('es sensible a mayusculas/minusculas (no normaliza el input)', () => {
    expect(categoriaDesdeCapitalizada('reloj')).toBe('reloj');
  });

  it('CATEGORIA_CAPITALIZADA y categoriaDesdeCapitalizada son inversas entre si', () => {
    for (const [cat, capitalizada] of Object.entries(CATEGORIA_CAPITALIZADA)) {
      expect(categoriaDesdeCapitalizada(capitalizada)).toBe(cat);
    }
  });
});

describe('clasificarModelo', () => {
  it('clasifica como accesorio cuando el modelo menciona "Organizador"', () => {
    expect(clasificarModelo('Organizador de Relojes de Lujo')).toBe(
      'accesorio',
    );
  });

  it('clasifica como perfume cuando el modelo contiene una marca de perfumeria conocida', () => {
    expect(clasificarModelo('Lattafa Khamrah')).toBe('perfume');
    expect(clasificarModelo('Afnan 9pm')).toBe('perfume');
  });

  it('cae a reloj por defecto cuando no matchea ninguna heuristica', () => {
    expect(clasificarModelo('Rolex Submariner')).toBe('reloj');
    expect(clasificarModelo('')).toBe('reloj');
  });

  it('prioriza "Organizador" sobre las palabras clave de perfume si ambas aparecen', () => {
    expect(clasificarModelo('Organizador Lattafa')).toBe('accesorio');
  });
});
