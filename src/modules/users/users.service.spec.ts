import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

function makeService() {
  const repository = {
    findAllPaginated: jest.fn(),
    findByIdWithOrders: jest.fn(),
  };
  const service = new UsersService(repository as any);
  return { service, repository };
}

describe('UsersService.findAll', () => {
  it('filtra por nombre/email solo cuando hay search', async () => {
    const { service, repository } = makeService();
    repository.findAllPaginated.mockResolvedValue({ data: [], total: 0 });

    await service.findAll('ana', 1, 20);

    expect(repository.findAllPaginated).toHaveBeenCalledWith(
      {
        OR: [
          { nombre: { contains: 'ana', mode: 'insensitive' } },
          { email: { contains: 'ana', mode: 'insensitive' } },
        ],
      },
      0,
      20,
    );
  });

  it('sin search, no aplica filtro', async () => {
    const { service, repository } = makeService();
    repository.findAllPaginated.mockResolvedValue({ data: [], total: 0 });

    await service.findAll(undefined, 1, 20);

    expect(repository.findAllPaginated).toHaveBeenCalledWith({}, 0, 20);
  });

  it('calcula totalPedidos y totalGastado por usuario', async () => {
    const { service, repository } = makeService();
    repository.findAllPaginated.mockResolvedValue({
      data: [
        {
          id: 'u1',
          nombre: 'Ana',
          email: 'ana@test.com',
          rol: 'CLIENTE',
          createdAt: new Date('2026-01-01'),
          _count: { orders: 2 },
          orders: [{ total: 1000 }, { total: 500 }],
        },
      ],
      total: 1,
    });

    const result = await service.findAll(undefined, 1, 20);

    expect(result.data[0]).toEqual(
      expect.objectContaining({ totalPedidos: 2, totalGastado: 1500 }),
    );
  });

  it('calcula la paginacion en meta', async () => {
    const { service, repository } = makeService();
    repository.findAllPaginated.mockResolvedValue({ data: [], total: 45 });

    const result = await service.findAll(undefined, 2, 20);

    expect(result.meta).toEqual({
      total: 45,
      page: 2,
      limit: 20,
      totalPages: 3,
    });
  });
});

describe('UsersService.findOne', () => {
  it('lanza NotFoundException si no existe', async () => {
    const { service, repository } = makeService();
    repository.findByIdWithOrders.mockResolvedValue(null);

    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  it('agrega totalGastado calculado desde las ordenes', async () => {
    const { service, repository } = makeService();
    repository.findByIdWithOrders.mockResolvedValue({
      id: 'u1',
      nombre: 'Ana',
      orders: [{ total: 1000 }, { total: 2000 }],
    });

    const result = await service.findOne('u1');

    expect(result.totalGastado).toBe(3000);
  });
});
