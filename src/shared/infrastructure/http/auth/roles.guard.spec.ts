import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleReaderPort } from '../../../application/ports/role-reader.port';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  function makeContext(user?: { id?: string; rol: string }): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  function makeGuard(
    requiredRoles: string[] | undefined,
    rolActual = jest.fn().mockResolvedValue('CLIENTE'),
  ) {
    const roles: RoleReaderPort = { rolActual };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    } as unknown as Reflector;
    return { guard: new RolesGuard(reflector, roles), rolActual };
  }

  it('permite el acceso cuando la ruta no declara @Roles(...)', async () => {
    const { guard } = makeGuard(undefined);
    expect(await guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('permite el acceso cuando @Roles([]) esta vacio', async () => {
    const { guard } = makeGuard([]);
    expect(await guard.canActivate(makeContext({ rol: 'CLIENTE' }))).toBe(true);
  });

  it('no consulta la base si la ruta no declara roles', async () => {
    const { guard, rolActual } = makeGuard(undefined);
    await guard.canActivate(makeContext({ id: 'u1', rol: 'ADMIN' }));
    expect(rolActual).not.toHaveBeenCalled();
  });

  it('permite el acceso cuando el rol actual esta en la lista requerida', async () => {
    const { guard } = makeGuard(
      ['ADMIN'],
      jest.fn().mockResolvedValue('ADMIN'),
    );
    expect(
      await guard.canActivate(makeContext({ id: 'u1', rol: 'CLIENTE' })),
    ).toBe(true);
  });

  it('rechaza cuando el rol actual no esta en la lista requerida', async () => {
    const { guard } = makeGuard(['ADMIN']);
    await expect(
      guard.canActivate(makeContext({ id: 'u1', rol: 'CLIENTE' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('usa el rol de la base, no el del token', async () => {
    const { guard } = makeGuard(
      ['ADMIN'],
      jest.fn().mockResolvedValue('CLIENTE'),
    );
    await expect(
      guard.canActivate(makeContext({ id: 'u1', rol: 'ADMIN' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rechaza si el usuario ya no existe', async () => {
    const { guard } = makeGuard(['ADMIN'], jest.fn().mockResolvedValue(null));
    await expect(
      guard.canActivate(makeContext({ id: 'u1', rol: 'ADMIN' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rechaza cuando no hay usuario en el request pero la ruta requiere un rol', async () => {
    const { guard } = makeGuard(['ADMIN']);
    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
