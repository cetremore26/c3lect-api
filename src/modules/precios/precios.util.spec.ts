import { calcularCostoTotal, calcularGananciaMinima } from './precios.util';

describe('calcularCostoTotal', () => {
  it('suma costo unitario y adicional', () => {
    expect(calcularCostoTotal(120000, 25028)).toBe(145028);
  });
});

describe('calcularGananciaMinima', () => {
  it('resta costoTotal al precioCierre', () => {
    expect(calcularGananciaMinima(160000, 100000)).toBe(60000);
  });

  it('devuelve null cuando no hay precio de cierre', () => {
    expect(calcularGananciaMinima(null, 100000)).toBeNull();
  });

  it('reporta ganancia negativa cuando se cierra por debajo del costo', () => {
    expect(calcularGananciaMinima(80000, 100000)).toBe(-20000);
  });

  it('trata un precio de cierre de cero como valor valido, no como ausente', () => {
    expect(calcularGananciaMinima(0, 50000)).toBe(-50000);
  });
});
