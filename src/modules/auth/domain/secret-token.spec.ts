import {
  crearTokenDeReset,
  hashDeSecreto,
  hashesIguales,
  parsearTokenDeReset,
} from './secret-token';

describe('secret-token', () => {
  it('ida y vuelta', () =>
    expect(
      parsearTokenDeReset(crearTokenDeReset('id-1', 'a'.repeat(64))),
    ).toEqual({ id: 'id-1', secreto: 'a'.repeat(64) }));

  it.each(['', 'abc', 'a'.repeat(64), '.' + 'a'.repeat(64), 'id.', 'id.zz'])(
    'rechaza %p',
    (t) => expect(parsearTokenDeReset(t)).toBeNull(),
  );

  it('hashesIguales', () => {
    expect(hashesIguales('ab', 'ab')).toBe(true);
    expect(hashesIguales('ab', 'ac')).toBe(false);
    expect(hashesIguales('ab', 'abc')).toBe(false);
  });

  it('hashDeSecreto es sha256 hex', () =>
    expect(hashDeSecreto('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    ));
});
