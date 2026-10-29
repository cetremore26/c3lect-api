import {
  calcularPrecioFinal,
  mejorDescuento,
  PromocionLike,
  ProductoLike,
} from './promotions.util';

const producto: ProductoLike = { id: 'prod-1', cat: 'relojes', marca: 'Rolex' };

function promo(overrides: Partial<PromocionLike> = {}): PromocionLike {
  return {
    alcance: 'PRODUCTO',
    porcentaje: 20,
    productosIncluidos: ['prod-1'],
    categoria: null,
    marca: null,
    excluidos: [],
    soloCuentaActiva: false,
    fechaInicio: new Date('2020-01-01'),
    fechaFin: new Date('2999-01-01'),
    activo: true,
    ...overrides,
  };
}

describe('mejorDescuento', () => {
  it('toma el mayor porcentaje entre las promociones que aplican', () => {
    expect(
      mejorDescuento(
        [
          promo({ porcentaje: 10 }),
          promo({ alcance: 'MARCA', marca: 'Rolex', porcentaje: 25 }),
        ],
        producto,
        false,
      ),
    ).toBe(25);
  });

  it('ignora las promociones solo para cuentas si el comprador no esta autenticado', () => {
    const soloCuenta = promo({ soloCuentaActiva: true });
    expect(mejorDescuento([soloCuenta], producto, false)).toBe(0);
    expect(mejorDescuento([soloCuenta], producto, true)).toBe(20);
  });

  it('ignora promociones vencidas, inactivas o que excluyen el producto', () => {
    expect(
      mejorDescuento(
        [
          promo({ fechaFin: new Date('2021-01-01') }),
          promo({ activo: false }),
          promo({ alcance: 'TODOS', excluidos: ['prod-1'] }),
        ],
        producto,
        true,
      ),
    ).toBe(0);
  });
});

describe('calcularPrecioFinal', () => {
  it('aplica el porcentaje y redondea', () => {
    expect(calcularPrecioFinal(1000, 20)).toBe(800);
    expect(calcularPrecioFinal(999, 15)).toBe(849);
  });

  it('sin descuento, devuelve el precio original', () => {
    expect(calcularPrecioFinal(1000, 0)).toBe(1000);
  });
});
