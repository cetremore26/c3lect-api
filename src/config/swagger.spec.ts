import { exponerSwagger } from './swagger';

describe('exponerSwagger', () => {
  it('solo fuera de producción', () => {
    expect(exponerSwagger('production')).toBe(false);
    expect(exponerSwagger('development')).toBe(true);
    expect(exponerSwagger(undefined)).toBe(true);
  });
});
