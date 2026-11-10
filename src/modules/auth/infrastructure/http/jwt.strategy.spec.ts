import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const strategy = new JwtStrategy({
    getOrThrow: () => 's',
  } as unknown as ConfigService);

  it('rechaza un challengeToken usado como access token', () => {
    expect(() =>
      strategy.validate({ sub: 'admin-1', purpose: 'admin-2fa' } as never),
    ).toThrow(UnauthorizedException);
  });

  it('acepta un access token normal', () => {
    expect(strategy.validate({ sub: 'u', email: 'e', rol: 'CLIENTE' })).toEqual(
      { id: 'u', email: 'e', rol: 'CLIENTE' },
    );
  });
});
