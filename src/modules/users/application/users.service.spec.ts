import { NotFoundError } from '../../../shared/domain/domain-error';
import { UsersService } from './users.service';

function makeService() {
  const repository = {
    findAllPaginated: jest.fn(),
    findById: jest.fn(),
    findNombre: jest.fn(),
  };
  const orders = {
    totalsByUser: jest.fn().mockResolvedValue(new Map()),
    listByUser: jest.fn().mockResolvedValue([]),
  };
  const service = new UsersService(repository, orders);
  return { service, repository, orders };
}

describe('UsersService.findAll', () => {
  it('pasa el search al repositorio', async () => {
    const { service, repository } = makeService();
    repository.findAllPaginated.mockResolvedValue({ data: [], total: 0 });

    await service.findAll('ana', 1, 20);

    expect(repository.findAllPaginated).toHaveBeenCalledWith(
      { search: 'ana' },
      0,
      20,
    );
  });

  it('calcula totalPedidos y totalGastado con los pedidos de cada usuario', async () => {
    const { service, repository, orders } = makeService();
    repository.findAllPaginated.mockResolvedValue({
      data: [
        {
          id: 'u1',
          nombre: 'Ana',
          email: 'ana@test.com',
          rol: 'CLIENTE',
          createdAt: new Date('2026-01-01'),
        },
        {
          id: 'u2',
          nombre: 'Beto',
          email: 'beto@test.com',
          rol: 'CLIENTE',
          createdAt: new Date('2026-01-02'),
        },
      ],
      total: 2,
    });
    orders.totalsByUser.mockResolvedValue(
      new Map([['u1', [{ total: 1000 }, { total: 500 }]]]),
    );

    const result = await service.findAll(undefined, 1, 20);

    expect(orders.totalsByUser).toHaveBeenCalledWith(['u1', 'u2']);
    expect(result.data[0]).toEqual(
      expect.objectContaining({ totalPedidos: 2, totalGastado: 1500 }),
    );
    expect(result.data[1]).toEqual(
      expect.objectContaining({ totalPedidos: 0, totalGastado: 0 }),
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
  it('lanza NotFoundError si no existe', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue(null);

    await expect(service.findOne('x')).rejects.toThrow(NotFoundError);
  });

  it('agrega los pedidos y el totalGastado calculado desde ellos', async () => {
    const { service, repository, orders } = makeService();
    repository.findById.mockResolvedValue({ id: 'u1', nombre: 'Ana' });
    const pedidos = [{ total: 1000 }, { total: 2000 }];
    orders.listByUser.mockResolvedValue(pedidos);

    const result = await service.findOne('u1');

    expect(orders.listByUser).toHaveBeenCalledWith('u1');
    expect(result.orders).toBe(pedidos);
    expect(result.totalGastado).toBe(3000);
  });
});
