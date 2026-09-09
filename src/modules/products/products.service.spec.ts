import { ProductsService } from './products.service';
import {
  ProductSortBy,
  RangoPrecio,
  SortOrder,
} from './dto/query-product.dto';

describe('ProductsService.findAll', () => {
  let repo: { findAll: jest.Mock; findAllPaginated: jest.Mock };
  let service: ProductsService;

  beforeEach(() => {
    repo = {
      findAll: jest.fn().mockResolvedValue([]),
      findAllPaginated: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };
    service = new ProductsService(repo as any);
  });

  const whereDeLaLlamada = () => repo.findAll.mock.calls[0][0];
  const orderByDeLaLlamada = () => repo.findAll.mock.calls[0][1];

  describe('filtros', () => {
    it('no aplica ningun filtro cuando la query viene vacia', async () => {
      await service.findAll({} as any);
      expect(whereDeLaLlamada()).toEqual({});
    });

    it('filtra por categoria, marca y genero sin distinguir mayusculas', async () => {
      await service.findAll({
        categoria: 'reloj',
        marca: 'Fossil',
        genero: 'Hombre',
      } as any);

      expect(whereDeLaLlamada()).toEqual({
        cat: { equals: 'reloj', mode: 'insensitive' },
        marca: { equals: 'Fossil', mode: 'insensitive' },
        genero: { equals: 'Hombre', mode: 'insensitive' },
      });
    });

    it('respeta soloDisponibles en false, sin confundirlo con ausente', async () => {
      await service.findAll({ soloDisponibles: false } as any);
      expect(whereDeLaLlamada().disponible).toBe(false);
    });

    it('omite el filtro de disponibilidad cuando no se envia', async () => {
      await service.findAll({} as any);
      expect(whereDeLaLlamada()).not.toHaveProperty('disponible');
    });

    it('busca productos incompletos por precio, estilo o imagenes vacias', async () => {
      await service.findAll({ incompletos: true } as any);
      expect(whereDeLaLlamada().OR).toEqual([
        { precio: 0 },
        { estilo: '' },
        { imgs: { equals: [] } },
      ]);
    });
  });

  describe('rangos de precio', () => {
    it.each([
      [RangoPrecio.BAJO, { gte: 0, lte: 150 }],
      [RangoPrecio.MEDIO, { gte: 150, lte: 300 }],
      [RangoPrecio.ALTO, { gte: 300 }],
    ])('traduce el rango %s', async (rango, esperado) => {
      await service.findAll({ rangoPrecio: rango } as any);
      expect(whereDeLaLlamada().precio).toEqual(esperado);
    });
  });

  describe('ordenamiento', () => {
    it('ordena por disponibles primero y luego alfabeticamente por defecto', async () => {
      await service.findAll({} as any);
      expect(orderByDeLaLlamada()).toEqual([
        { disponible: 'desc' },
        { nombre: 'asc' },
      ]);
    });

    it('ordena por precio ascendente cuando no se indica direccion', async () => {
      await service.findAll({ sortBy: ProductSortBy.PRECIO } as any);
      expect(orderByDeLaLlamada()).toEqual([{ precio: SortOrder.ASC }]);
    });

    it('respeta la direccion descendente', async () => {
      await service.findAll({
        sortBy: ProductSortBy.PRECIO,
        sortOrder: SortOrder.DESC,
      } as any);
      expect(orderByDeLaLlamada()).toEqual([{ precio: 'desc' }]);
    });
  });

  describe('paginacion', () => {
    it('devuelve la lista plana cuando no se pide paginacion', async () => {
      await service.findAll({} as any);
      expect(repo.findAll).toHaveBeenCalled();
      expect(repo.findAllPaginated).not.toHaveBeenCalled();
    });

    it('pagina en cuanto se envia solo limit', async () => {
      await service.findAll({ limit: 10 } as any);
      expect(repo.findAllPaginated).toHaveBeenCalledWith(
        {},
        0,
        10,
        expect.anything(),
      );
    });

    it('calcula el skip a partir de pagina y limite', async () => {
      await service.findAll({ page: 3, limit: 20 } as any);
      expect(repo.findAllPaginated).toHaveBeenCalledWith(
        {},
        40,
        20,
        expect.anything(),
      );
    });

    it('usa pagina 1 y limite 20 por defecto al paginar', async () => {
      await service.findAll({ page: 1 } as any);
      expect(repo.findAllPaginated).toHaveBeenCalledWith(
        {},
        0,
        20,
        expect.anything(),
      );
    });

    it('redondea totalPages hacia arriba', async () => {
      repo.findAllPaginated.mockResolvedValue({ data: [], total: 41 });
      const res: any = await service.findAll({ page: 1, limit: 20 } as any);
      expect(res.meta.totalPages).toBe(3);
    });

    it('devuelve totalPages en 0 cuando no hay resultados', async () => {
      repo.findAllPaginated.mockResolvedValue({ data: [], total: 0 });
      const res: any = await service.findAll({ page: 1, limit: 20 } as any);
      expect(res.meta.totalPages).toBe(0);
    });
  });
});
