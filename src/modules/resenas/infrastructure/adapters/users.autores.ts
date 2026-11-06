import { Injectable } from '@nestjs/common';
import type { AutoresPort } from '../../application/ports/autores.port';
import { UsersFacade } from '../../../users/public-api';

@Injectable()
export class UsersAutores implements AutoresPort {
  constructor(private readonly users: UsersFacade) {}

  nombreDe(userId: string): Promise<string | undefined> {
    return this.users.findNombre(userId);
  }
}
