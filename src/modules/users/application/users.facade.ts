import { Inject, Injectable } from '@nestjs/common';
import { USERS_REPOSITORY } from './ports/users-repository.port';
import type { UsersRepositoryPort } from './ports/users-repository.port';

// API pública del contexto de usuarios para otros módulos (se expone en
// public-api.ts). Solo consultas: nadie fuera de identidad escribe usuarios.
@Injectable()
export class UsersFacade {
  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
  ) {}

  findNombre(userId: string): Promise<string | undefined> {
    return this.usersRepository.findNombre(userId);
  }
}
