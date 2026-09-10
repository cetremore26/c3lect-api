import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountRepository } from './account.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AccountService {
  constructor(private readonly accountRepository: AccountRepository) {}

  async getProfile(userId: string) {
    const user = await this.accountRepository.getProfile(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return user;
  }

  updateProfile(userId: string, dto: UpdateProfileDto) {
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
    if (!address) throw new NotFoundException('Dirección no encontrada.');
    if (address.userId !== userId)
      throw new ForbiddenException('No tienes permiso sobre esta dirección.');
    return address;
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
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

  async updateAddress(userId: string, id: string, dto: UpdateAddressDto) {
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
