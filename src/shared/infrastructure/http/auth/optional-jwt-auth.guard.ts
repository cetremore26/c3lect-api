import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Passes through without throwing when no/invalid token is provided
  handleRequest<TUser = any>(_err: unknown, user: TUser): TUser {
    return user;
  }
}
