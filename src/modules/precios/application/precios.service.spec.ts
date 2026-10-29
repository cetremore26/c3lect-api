import { NotFoundError } from '../../../shared/domain/domain-error';
import { PreciosService } from './precios.service';

const crearRepository = () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
});

describe('PreciosService', () => {
  let repository: ReturnType<typeof crearRepository>;
  let audit: { log: jest.Mock };
  let catalog: { actualizarPrecioPublico: jest.Mock };
  let service: PreciosService;

  beforeEach(() => {
    repository = crearRepository();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    catalog = {
      actualizarPrecioPublico: jest.fn().mockResolvedValue(undefined),
    };
    service = new PreciosService(repository as any, catalog, audit);
  });

  describe('findAll', () => {
    it('calcula gananciaMinima como precioCierre menos costoTotal', async () => {
      repository.findAll.mockResolvedValue([
        { id: '1', modelo: 'Grant', costoTotal: 100000, precioCierre: 160000 },
      ]);

      const [item] = await service.findAll();

      expect(item.gananciaMinima).toBe(60000);
    });

    it('deja gananciaMinima en null cuando no hay precio de cierre', async () => {
      repository.findAll.mockResolvedValue([
        { id: '1', modelo: 'Grant', costoTotal: 100000, precioCierre: null },
      ]);

      const [item] = await service.findAll();

      expect(item.gananciaMinima).toBeNull();
    });

    it('reporta ganancia negativa cuando se cierra por debajo del costo', async () => {
      repository.findAll.mockResolvedValue([
        { id: '1', modelo: 'Grant', costoTotal: 100000, precioCierre: 80000 },
      ]);

      const [item] = await service.findAll();

      expect(item.gananciaMinima).toBe(-20000);
    });

    it('trata un precio de cierre de cero como valor valido, no como ausente', async () => {
      repository.findAll.mockResolvedValue([
        { id: '1', modelo: 'Grant', costoTotal: 50000, precioCierre: 0 },
      ]);

      const [item] = await service.findAll();

      expect(item.gananciaMinima).toBe(-50000);
    });
  });

  describe('create', () => {
    const dto = {
      marca: 'Fossil',
      modelo: 'Grant',
      costoUnitario: 120000,
      costoAdicional: 25028,
      precioPublico: 250000,
    } as any;

    beforeEach(() => {
      repository.create.mockResolvedValue({ id: 'p1' });
    });

    it('deriva costoTotal sumando costo unitario y adicional', async () => {
      await service.create(dto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ costoTotal: 145028 }),
      );
    });

    it('sin costo adicional, aplica el valor por defecto del dominio', async () => {
      await service.create({ ...dto, costoAdicional: undefined });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ costoAdicional: 25028, costoTotal: 145028 }),
      );
    });

    it('respeta un costo adicional explicito', async () => {
      await service.create({ ...dto, costoAdicional: 10000 });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ costoAdicional: 10000, costoTotal: 130000 }),
      );
    });

    it('propaga el precio publico al catalogo usando marca mas modelo', async () => {
      await service.create(dto);

      expect(catalog.actualizarPrecioPublico).toHaveBeenCalledWith(
        'Fossil Grant',
        250000,
      );
    });

    it('no toca el catalogo cuando no se define precio publico', async () => {
      await service.create({ ...dto, precioPublico: undefined });

      expect(catalog.actualizarPrecioPublico).not.toHaveBeenCalled();
    });

    it('registra la creacion en auditoria', async () => {
      await service.create(dto, 'user-1');

      expect(audit.log).toHaveBeenCalledWith(
        'CREAR',
        'precio',
        'p1',
        expect.stringContaining('Fossil Grant'),
        'user-1',
      );
    });
  });

  describe('update', () => {
    const existente = {
      id: 'p1',
      marca: 'Fossil',
      modelo: 'Grant',
      costoUnitario: 100000,
      costoAdicional: 25028,
      precioPublico: 200000,
      precioCierre: 180000,
    };

    beforeEach(() => {
      repository.findById.mockResolvedValue(existente);
      repository.update.mockResolvedValue({ id: 'p1' });
    });

    it('lanza NotFoundError si el registro no existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update('inexistente', {})).rejects.toThrow(
        NotFoundError,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('conserva los valores existentes que el dto no envia', async () => {
      await service.update('p1', { costoUnitario: 130000 });

      expect(repository.update).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          costoUnitario: 130000,
          costoAdicional: 25028,
          costoTotal: 155028,
        }),
      );
    });

    it('permite poner el precio de cierre en null explicitamente', async () => {
      await service.update('p1', { precioCierre: null });

      expect(repository.update).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ precioCierre: null }),
      );
    });

    it('no propaga al catalogo si el precio publico llega en null', async () => {
      await service.update('p1', { precioPublico: null });

      expect(catalog.actualizarPrecioPublico).not.toHaveBeenCalled();
    });

    it('propaga usando la marca almacenada, no la del dto', async () => {
      await service.update('p1', {
        precioPublico: 300000,
        marca: 'Casio',
      } as any);

      expect(catalog.actualizarPrecioPublico).toHaveBeenCalledWith(
        'Fossil Grant',
        300000,
      );
    });
  });
});
