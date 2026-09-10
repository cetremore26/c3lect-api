import { buildOrderNumber } from './order-number';

describe('buildOrderNumber', () => {
  it('genera un orderNumber con el formato C3L-YYYYMMDD-XXXXX', () => {
    expect(buildOrderNumber()).toMatch(/^C3L-\d{8}-[A-Z0-9]{5}$/);
  });

  it('no repite el mismo sufijo en llamadas consecutivas (aleatoriedad real)', () => {
    const suffixes = new Set(
      Array.from({ length: 20 }, () => buildOrderNumber().split('-')[2]),
    );
    expect(suffixes.size).toBeGreaterThan(1);
  });
});
