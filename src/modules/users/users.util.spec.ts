import { calcularTotalGastado } from './users.util';

describe('calcularTotalGastado', () => {
  it('suma el total de todos los pedidos', () => {
    expect(calcularTotalGastado([{ total: 1000 }, { total: 2500 }])).toBe(3500);
  });

  it('devuelve 0 sin pedidos', () => {
    expect(calcularTotalGastado([])).toBe(0);
  });
});
