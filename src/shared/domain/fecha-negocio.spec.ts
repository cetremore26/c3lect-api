import {
  diaDeNegocio,
  diaDeNegocioComoFecha,
  finDelDiaDeNegocio,
  inicioDelDiaDeNegocio,
} from './fecha-negocio';

describe('fecha-negocio', () => {
  it('a las 22:30 de Bogotá sigue siendo el mismo día', () => {
    expect(diaDeNegocio(new Date('2026-11-11T03:30:00Z'))).toBe('2026-11-10');
  });
  it('a medianoche de Bogotá cambia el día', () => {
    expect(diaDeNegocio(new Date('2026-11-11T05:00:00Z'))).toBe('2026-11-11');
  });
  it('rango del día con offset -05:00', () => {
    expect(inicioDelDiaDeNegocio('2026-11-10').toISOString()).toBe(
      '2026-11-10T05:00:00.000Z',
    );
    expect(finDelDiaDeNegocio('2026-11-10').toISOString()).toBe(
      '2026-11-11T04:59:59.999Z',
    );
  });
  it('diaDeNegocioComoFecha devuelve la medianoche UTC del día de Bogotá', () => {
    expect(
      diaDeNegocioComoFecha(new Date('2026-11-11T03:30:00Z')).toISOString(),
    ).toBe('2026-11-10T00:00:00.000Z');
  });
});
