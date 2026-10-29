import { Inject, Injectable } from '@nestjs/common';
import {
  ForbiddenError,
  NotFoundError,
} from '../../../shared/domain/domain-error';
import { ACCOUNT_REPOSITORY } from './ports/account-repository.port';
import type { AccountRepositoryPort } from './ports/account-repository.port';

export interface ProfileUpdate {
  nombre?: string;
  telefono?: string;
}

export interface AddressInput {
  alias?: string;
  ciudad: string;
  departamento: string;
  direccion: string;
  esPrincipal?: boolean;
}

@Injectable()
export class AccountService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepositoryPort,
  ) {}

  async getProfile(userId: string) {
    const user = await this.accountRepository.getProfile(userId);
    if (!user) throw new NotFoundError('Usuario no encontrado.');
    return user;
  }

  updateProfile(userId: string, dto: ProfileUpdate) {
    return this.accountRepository.updateProfile(userId, {
      nombre: dto.nombre,
      telefono: dto.telefono,
    });
  }

  listAddresses(userId: string) {
    return this.accountRepository.listAddresses(userId);
  }

  // Verifica que la dirección exista y sea del usuario — nunca deja que un
  // cliente lea/edite/borre la dirección de otro por id adivinado.
  private async requireOwnAddress(userId: string, id: string) {
    const address = await this.accountRepository.findAddressById(id);
    if (!address) throw new NotFoundError('Dirección no encontrada.');
    if (address.userId !== userId)
      throw new ForbiddenError('No tienes permiso sobre esta dirección.');
    return address;
  }

  async createAddress(userId: string, dto: AddressInput) {
    const totalExistentes = await this.accountRepository.countAddresses(userId);
    // La primera dirección de un usuario siempre queda como principal, haya
    // o no marcado la casilla — nunca debe quedar un usuario sin ninguna.
    const esPrincipal = totalExistentes === 0 || dto.esPrincipal === true;

    return this.accountRepository.createAddress(
      userId,
      {
        alias: dto.alias,
        ciudad: dto.ciudad,
        departamento: dto.departamento,
        direccion: dto.direccion,
      },
      esPrincipal,
    );
  }

  async updateAddress(userId: string, id: string, dto: Partial<AddressInput>) {
    await this.requireOwnAddress(userId, id);

    return this.accountRepository.updateAddress(
      userId,
      id,
      {
        alias: dto.alias,
        ciudad: dto.ciudad,
        departamento: dto.departamento,
        direccion: dto.direccion,
      },
      dto.esPrincipal === true,
    );
  }

  async setPrincipal(userId: string, id: string) {
    await this.requireOwnAddress(userId, id);
    return this.accountRepository.setPrincipal(userId, id);
  }

  async deleteAddress(userId: string, id: string) {
    const address = await this.requireOwnAddress(userId, id);
    await this.accountRepository.deleteAddress(userId, id, address.esPrincipal);
    return { message: 'Dirección eliminada.' };
  }
}
