import { discrepanciaDeMonto } from './discrepancia-de-monto';

describe('discrepanciaDeMonto', () => {
  it('cuadra si el monto es igual al total y la moneda es COP', () => {
    expect(
      discrepanciaDeMonto(
        { transactionAmount: 50000, currencyId: 'COP' },
        50000,
      ),
    ).toBeNull();
  });

  it('moneda distinta', () => {
    expect(
      discrepanciaDeMonto(
        { transactionAmount: 50000, currencyId: 'USD' },
        50000,
      ),
    ).toBe('Moneda cobrada USD distinta de COP');
  });

  it('sin moneda', () => {
    expect(
      discrepanciaDeMonto(
        { transactionAmount: 50000, currencyId: undefined },
        50000,
      ),
    ).toBe('Moneda cobrada (sin moneda) distinta de COP');
  });

  it('monto distinto', () => {
    expect(
      discrepanciaDeMonto(
        { transactionAmount: 49000, currencyId: 'COP' },
        50000,
      ),
    ).toBe('Monto cobrado 49000 distinto del total esperado 50000');
  });

  it('sin monto', () => {
    expect(
      discrepanciaDeMonto(
        { transactionAmount: undefined, currencyId: 'COP' },
        50000,
      ),
    ).toBe('Monto cobrado (sin monto) distinto del total esperado 50000');
  });

  it('la moneda se revisa antes que el monto', () => {
    expect(
      discrepanciaDeMonto({ transactionAmount: 1, currencyId: 'USD' }, 50000),
    ).toBe('Moneda cobrada USD distinta de COP');
  });
});
