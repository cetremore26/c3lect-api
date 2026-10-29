import { NotFoundError } from '../../../shared/domain/domain-error';
import { ProductSortBy, SortOrder } from '../domain/product';
import { ProductsService } from './products.service';

function makeService() {
  const repo = {
    findAll: jest.fn().mockResolvedValue([]),
    findAllPaginated: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ProductsService(repo as any, audit);
  return { service, repo, audit };
}

describe('ProductsService.findAll', () => {
  it('separa filtro y orden antes de consultar al repositorio', async () => {
    const { service, repo } = makeService();

    await service.findAll({
      marca: 'Fossil',
      sortBy: ProductSortBy.PRECIO,
      sortOrder: SortOrder.DESC,
    });

    expect(repo.findAll).toHaveBeenCalledWith(
      { marca: 'Fossil' },
      { sortBy: ProductSortBy.PRECIO, sortOrder: SortOrder.DESC },
    );
  });

  describe('paginacion', () => {
    it('devuelve la lista plana cuando no se pide paginacion', async () => {
      const { service, repo } = makeService();
      await service.findAll({});
      expect(repo.findAll).toHaveBeenCalled();
      expect(repo.findAllPaginated).not.toHaveBeenCalled();
    });

    it('pagina en cuanto se envia solo limit', async () => {
      const { service, repo } = makeService();
      await service.findAll({ limit: 10 });
      expect(repo.findAllPaginated).toHaveBeenCalledWith(
        {},
        expect.anything(),
        0,
        10,
      );
    });

    it('calcula el skip a partir de pagina y limite', async () => {
      const { service, repo } = makeService();
      await service.findAll({ page: 3, limit: 20 });
      expect(repo.findAllPaginated).toHaveBeenCalledWith(
        {},
        expect.anything(),
        40,
        20,
      );
    });

    it('usa pagina 1 y limite 20 por defecto al paginar', async () => {
      const { service, repo } = makeService();
      await service.findAll({ page: 1 });
      expect(repo.findAllPaginated).toHaveBeenCalledWith(
        {},
        expect.anything(),
        0,
        20,
      );
    });

    it('redondea totalPages hacia arriba', async () => {
      const { service, repo } = makeService();
      repo.findAllPaginated.mockResolvedValue({ data: [], total: 41 });
      const res: any = await service.findAll({ page: 1, limit: 20 });
      expect(res.meta.totalPages).toBe(3);
    });

    it('devuelve totalPages en 0 cuando no hay resultados', async () => {
      const { service } = makeService();
      const res: any = await service.findAll({ page: 1, limit: 20 });
      expect(res.meta.totalPages).toBe(0);
    });
  });
});

describe('ProductsService escrituras', () => {
  it('update/remove lanzan NotFoundError si el producto no existe', async () => {
    const { service, repo } = makeService();
    repo.findById.mockResolvedValue(null);

    await expect(service.update('x', {})).rejects.toThrow(NotFoundError);
    await expect(service.remove('x')).rejects.toThrow(NotFoundError);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('registra la creacion en auditoria con el display del producto', async () => {
    const { service, repo, audit } = makeService();
    repo.create.mockResolvedValue({ id: 'r-rolex-sub', display: 'Rolex Sub' });

    await service.create({} as any, 'admin-1');

    expect(audit.log).toHaveBeenCalledWith(
      'CREAR',
      'producto',
      'r-rolex-sub',
      'Producto creado: Rolex Sub',
      'admin-1',
    );
  });
});
