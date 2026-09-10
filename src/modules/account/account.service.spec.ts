import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountService } from './account.service';

function makeService() {
  const repository = {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    listAddresses: jest.fn(),
    findAddressById: jest.fn(),
    countAddresses: jest.fn(),
    createAddress: jest.fn(),
    updateAddress: jest.fn(),
    setPrincipal: jest.fn(),
    deleteAddress: jest.fn(),
  };
  const service = new AccountService(repository as any);
  return { service, repository };
}

describe('AccountService.getProfile', () => {
  it('lanza NotFoundException si no existe', async () => {
    const { service, repository } = makeService();
    repository.getProfile.mockResolvedValue(null);

    await expect(service.getProfile('user-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('AccountService.createAddress', () => {
  const dto = {
    ciudad: 'Medellín',
    departamento: 'Antioquia',
    direccion: 'Calle 1',
  } as any;

  it('la primera direccion del usuario siempre queda como principal', async () => {
    const { service, repository } = makeService();
    repository.countAddresses.mockResolvedValue(0);

    await service.createAddress('user-1', dto);

    expect(repository.createAddress).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ ciudad: 'Medellín' }),
      true,
    );
  });

  it('sin ser la primera y sin marcar el checkbox, no queda como principal', async () => {
    const { service, repository } = makeService();
    repository.countAddresses.mockResolvedValue(2);

    await service.createAddress('user-1', dto);

    expect(repository.createAddress).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
      false,
    );
  });

  it('sin ser la primera pero marcando el checkbox, queda como principal', async () => {
    const { service, repository } = makeService();
    repository.countAddresses.mockResolvedValue(2);

    await service.createAddress('user-1', { ...dto, esPrincipal: true });

    expect(repository.createAddress).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
      true,
    );
  });
});

describe('AccountService — ownership de direcciones', () => {
  it('updateAddress lanza NotFoundException si la direccion no existe', async () => {
    const { service, repository } = makeService();
    repository.findAddressById.mockResolvedValue(null);

    await expect(service.updateAddress('user-1', 'addr-1', {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updateAddress lanza ForbiddenException si la direccion es de otro usuario', async () => {
    const { service, repository } = makeService();
    repository.findAddressById.mockResolvedValue({
      id: 'addr-1',
      userId: 'otro-user',
    });

    await expect(service.updateAddress('user-1', 'addr-1', {})).rejects.toThrow(
      ForbiddenException,
    );
    expect(repository.updateAddress).not.toHaveBeenCalled();
  });

  it('deleteAddress propaga si la direccion eliminada era la principal', async () => {
    const { service, repository } = makeService();
    repository.findAddressById.mockResolvedValue({
      id: 'addr-1',
      userId: 'user-1',
      esPrincipal: true,
    });

    await service.deleteAddress('user-1', 'addr-1');

    expect(repository.deleteAddress).toHaveBeenCalledWith(
      'user-1',
      'addr-1',
      true,
    );
  });

  it('setPrincipal exige que la direccion sea del usuario antes de delegar', async () => {
    const { service, repository } = makeService();
    repository.findAddressById.mockResolvedValue({
      id: 'addr-1',
      userId: 'otro-user',
    });

    await expect(service.setPrincipal('user-1', 'addr-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(repository.setPrincipal).not.toHaveBeenCalled();
  });
});
