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

  it('usa el día de Bogotá, no el del servidor UTC', () => {
    expect(buildOrderNumber(new Date('2026-11-11T03:30:00Z'))).toMatch(
      /^C3L-20261110-[A-Z0-9]{5}$/,
    );
  });
});
