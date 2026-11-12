import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

function ctxConHeaders(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('OptionalJwtAuthGuard', () => {
  const guard = new OptionalJwtAuthGuard();

  afterEach(() => jest.restoreAllMocks());

  it('sin cabecera Authorization deja pasar como invitado', async () => {
    const superSpy = jest.spyOn(AuthGuard('jwt').prototype, 'canActivate');
    expect(await guard.canActivate(ctxConHeaders({}))).toBe(true);
    expect(superSpy).not.toHaveBeenCalled();
  });

  it('con cabecera delega en passport', async () => {
    const superSpy = jest
      .spyOn(AuthGuard('jwt').prototype, 'canActivate')
      .mockResolvedValue(true);
    expect(
      await guard.canActivate(ctxConHeaders({ authorization: 'Bearer x' })),
    ).toBe(true);
    expect(superSpy).toHaveBeenCalled();
  });

  it('con cabecera y token inválido responde 401', () => {
    expect(() => guard.handleRequest(null, false)).toThrow(
      UnauthorizedException,
    );
  });

  it('con token válido devuelve el usuario', () => {
    expect(guard.handleRequest(null, { id: 'u1' })).toEqual({ id: 'u1' });
  });
});
