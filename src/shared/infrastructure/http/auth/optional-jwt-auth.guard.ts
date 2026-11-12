import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Sin cabecera Authorization: invitado. Con cabecera: el token debe ser válido.
  canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    if (!request.headers.authorization) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(err: unknown, user: TUser): TUser {
    if (!user) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException('Sesión inválida o expirada.');
    }
    return user;
  }
}
