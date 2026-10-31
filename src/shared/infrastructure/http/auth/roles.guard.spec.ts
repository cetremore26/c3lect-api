import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  function makeContext(user?: { rol: string }): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  function makeGuard(requiredRoles: string[] | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('permite el acceso cuando la ruta no declara @Roles(...)', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('permite el acceso cuando @Roles([]) esta vacio', () => {
    const guard = makeGuard([]);
    expect(guard.canActivate(makeContext({ rol: 'CLIENTE' }))).toBe(true);
  });

  it('permite el acceso cuando el rol del usuario esta en la lista requerida', () => {
    const guard = makeGuard(['ADMIN']);
    expect(guard.canActivate(makeContext({ rol: 'ADMIN' }))).toBe(true);
  });

  it('rechaza cuando el rol del usuario no esta en la lista requerida', () => {
    const guard = makeGuard(['ADMIN']);
    expect(() => guard.canActivate(makeContext({ rol: 'CLIENTE' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza cuando no hay usuario en el request pero la ruta requiere un rol', () => {
    const guard = makeGuard(['ADMIN']);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
