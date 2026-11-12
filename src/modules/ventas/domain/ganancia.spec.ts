import { calcGananciaPorVenta } from './ganancia';

describe('calcGananciaPorVenta', () => {
  it('con abono completo, la ganancia es precio - costo - envio', () => {
    // precioVenta 100, costoProducto 60, costoEnvio 5, abono completo (100)
    expect(calcGananciaPorVenta('Pagado', 100, 60, 5, 100)).toBe(35);
  });

  it('con abono parcial, prorratea el margen segun el porcentaje pagado', () => {
    // margen = 100 - 60 - 0 = 40; abono es el 50% del precio -> ganancia = 20
    expect(calcGananciaPorVenta('Pendiente', 100, 60, 0, 50)).toBe(20);
  });

  it('con abono en cero, la ganancia reconocida es cero', () => {
    expect(calcGananciaPorVenta('Pendiente', 100, 60, 0, 0)).toBe(0);
  });

  it('cuando precioVenta es 0 (cortesia/perdida), la ganancia es el costo total en negativo', () => {
    expect(calcGananciaPorVenta('Pagado', 0, 60, 5, 0)).toBe(-65);
  });

  it('nunca prorratea sobre un abono mayor al precio de venta (se limita al 100%)', () => {
    // abono 150 sobre un precio de 100 no debe dar mas del margen completo (40)
    expect(calcGananciaPorVenta('Pagado', 100, 60, 0, 150)).toBe(40);
  });

  it('el estado recibido no afecta el calculo (es solo informativo para el llamador)', () => {
    expect(calcGananciaPorVenta('Cancelado', 100, 60, 5, 100)).toBe(
      calcGananciaPorVenta('Pagado', 100, 60, 5, 100),
    );
  });

  it('redondea al peso con abono no proporcional', () => {
    // margen 50000; abono 70000/150000 -> 23333.33...
    expect(calcGananciaPorVenta('Abonado', 150000, 100000, 0, 70000)).toBe(
      23333,
    );
  });

  it('normaliza -0 a 0', () => {
    // margen -100; abono 1/300 -> -0.33 -> Math.round = -0
    expect(calcGananciaPorVenta('Abonado', 300, 400, 0, 1)).toBe(0);
  });
});
