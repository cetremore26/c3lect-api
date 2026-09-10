import { NotFoundException } from '@nestjs/common';
import { PreciosService } from './precios.service';

const crearRepository = () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  syncPrecioPublico: jest.fn().mockResolvedValue(undefined),
});

describe('PreciosService', () => {
  let repository: ReturnType<typeof crearRepository>;
  let audit: { log: jest.Mock };
  let service: PreciosService;

  beforeEach(() => {
    repository = crearRepository();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new PreciosService(repository as any, audit as any);
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

    it('propaga el precio publico al catalogo usando marca mas modelo', async () => {
      await service.create(dto);

      expect(repository.syncPrecioPublico).toHaveBeenCalledWith(
        'Fossil Grant',
        250000,
      );
    });

    it('no toca el catalogo cuando no se define precio publico', async () => {
      await service.create({ ...dto, precioPublico: undefined });

      expect(repository.syncPrecioPublico).not.toHaveBeenCalled();
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

    it('lanza NotFoundException si el registro no existe', async () => {
      repository.findById.mockRejectedValue(
        new NotFoundException('Producto inexistente no encontrado'),
      );

      await expect(service.update('inexistente', {})).rejects.toThrow(
        NotFoundException,
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
      await service.update('p1', { precioCierre: null } as any);

      expect(repository.update).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ precioCierre: null }),
      );
    });

    it('no propaga al catalogo si el precio publico llega en null', async () => {
      await service.update('p1', { precioPublico: null } as any);

      expect(repository.syncPrecioPublico).not.toHaveBeenCalled();
    });

    it('propaga usando la marca almacenada, no la del dto', async () => {
      await service.update('p1', {
        precioPublico: 300000,
        marca: 'Casio',
      } as any);

      expect(repository.syncPrecioPublico).toHaveBeenCalledWith(
        'Fossil Grant',
        300000,
      );
    });
  });
});
