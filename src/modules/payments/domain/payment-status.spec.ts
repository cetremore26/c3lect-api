import {
  ESTADOS_TERMINALES,
  EstadoPago,
  reglaDeTransicion,
} from './payment-status';

describe('reglaDeTransicion', () => {
  it.each([
    EstadoPago.PENDIENTE,
    EstadoPago.RECHAZADO,
    EstadoPago.CANCELADO,
    EstadoPago.APROBADO,
  ])(
    '%s se alcanza desde PENDIENTE, RECHAZADO o CANCELADO, nunca desde un terminal',
    (nuevo) => {
      const regla = reglaDeTransicion(nuevo);
      expect([...regla.desde].sort()).toEqual(
        [
          EstadoPago.PENDIENTE,
          EstadoPago.RECHAZADO,
          EstadoPago.CANCELADO,
        ].sort(),
      );
      expect(regla.exigeMismoMpPaymentId).toBe(false);
    },
  );

  it('REEMBOLSADO solo desde APROBADO y solo para el mismo pago de MercadoPago', () => {
    expect(reglaDeTransicion(EstadoPago.REEMBOLSADO)).toEqual({
      desde: [EstadoPago.APROBADO],
      exigeMismoMpPaymentId: true,
    });
  });

  it('solo APROBADO y REEMBOLSADO son terminales', () => {
    expect(ESTADOS_TERMINALES).toEqual([
      EstadoPago.APROBADO,
      EstadoPago.REEMBOLSADO,
    ]);
  });
});
