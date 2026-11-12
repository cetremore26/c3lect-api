import { JwtService } from '@nestjs/jwt';
import { JwtPurposeTokens } from './auth-services.adapters';

describe('JwtPurposeTokens', () => {
  const jwt = new JwtService({ secret: 's' });
  const tokens = new JwtPurposeTokens(jwt);

  it('verifica un token de su propio propósito', () => {
    const t = tokens.firmar('registro', { email: 'a@x.com' }, 60);
    expect(tokens.verificar('registro', t)).toEqual(
      expect.objectContaining({ email: 'a@x.com' }),
    );
  });

  it('rechaza un token de otro propósito', () => {
    expect(
      tokens.verificar(
        'registro',
        tokens.firmar('admin-2fa', { sub: 'u1' }, 60),
      ),
    ).toBeNull();
  });

  it('rechaza un access token (sin purpose)', () => {
    expect(
      tokens.verificar('admin-2fa', jwt.sign({ sub: 'u1', rol: 'ADMIN' })),
    ).toBeNull();
  });

  it('rechaza un token vencido', () => {
    const vencido = jwt.sign(
      { purpose: 'registro', email: 'a@x.com' },
      { expiresIn: -10 },
    );
    expect(tokens.verificar('registro', vencido)).toBeNull();
  });

  it('rechaza basura', () => {
    expect(tokens.verificar('registro', 'no-es-jwt')).toBeNull();
  });
});
