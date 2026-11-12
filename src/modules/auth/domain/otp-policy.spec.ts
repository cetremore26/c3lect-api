import { generarCodigoOtp } from './otp-policy';

describe('generarCodigoOtp', () => {
  it('genera códigos de 6 dígitos sin ceros a la izquierda', () => {
    for (let i = 0; i < 500; i++) {
      expect(generarCodigoOtp()).toMatch(/^[1-9]\d{5}$/);
    }
  });
});
