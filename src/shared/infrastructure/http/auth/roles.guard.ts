import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ROLE_READER,
  type RoleReaderPort,
} from '../../../application/ports/role-reader.port';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ROLE_READER) private readonly roles: RoleReaderPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { id: string } }>();
    if (!user) throw this.denegado();

    // El rol del token se ignora: puede haber cambiado desde que se emitió.
    const rol = await this.roles.rolActual(user.id);
    if (rol === null || !required.includes(rol)) throw this.denegado();
    return true;
  }

  private denegado() {
    return new ForbiddenException(
      'No tienes permiso para realizar esta acción.',
    );
  }
}
