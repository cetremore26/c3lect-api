import { Injectable } from '@nestjs/common';
import type { UserDirectoryPort } from '../../application/ports/user-directory.port';
import { UsersFacade } from '../../../users/public-api';

// Adaptador de salida: traduce el puerto de auditoría a la API pública del
// contexto de usuarios.
@Injectable()
export class UsersFacadeUserDirectory implements UserDirectoryPort {
  constructor(private readonly users: UsersFacade) {}

  findNombre(userId: string): Promise<string | undefined> {
    return this.users.findNombre(userId);
  }
}
