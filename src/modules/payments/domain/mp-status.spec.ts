import { EstadoPago } from '@prisma/client';
import { mapEstadoPago } from './mp-status';

describe('mapEstadoPago', () => {
  it.each([
    ['approved', EstadoPago.APROBADO],
    ['rejected', EstadoPago.RECHAZADO],
    ['pending', EstadoPago.PENDIENTE],
    ['in_process', EstadoPago.PENDIENTE],
    ['cancelled', EstadoPago.CANCELADO],
  ])('mapea "%s" a %s', (mpStatus, esperado) => {
    expect(mapEstadoPago(mpStatus)).toBe(esperado);
  });

  it('un status desconocido o ausente de MercadoPago se trata como PENDIENTE', () => {
    expect(mapEstadoPago('algo-desconocido')).toBe(EstadoPago.PENDIENTE);
    expect(mapEstadoPago(undefined)).toBe(EstadoPago.PENDIENTE);
  });
});
