import { ocultoPorAdminTrasCambio } from './product';

describe('ocultoPorAdminTrasCambio', () => {
  it('deshabilitar a mano lo marca oculto', () =>
    expect(
      ocultoPorAdminTrasCambio({ disponible: true }, { disponible: false }),
    ).toBe(true));

  it('habilitar a mano lo desmarca', () =>
    expect(
      ocultoPorAdminTrasCambio({ disponible: false }, { disponible: true }),
    ).toBe(false));

  it('no cambia ocultoPorAdmin si disponible no cambia', () => {
    expect(
      ocultoPorAdminTrasCambio({ disponible: false }, { disponible: false }),
    ).toBeUndefined();
    expect(ocultoPorAdminTrasCambio({ disponible: true }, {})).toBeUndefined();
  });
});
