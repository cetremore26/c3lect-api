import { NotFoundException } from '@nestjs/common';
import { GastosService } from './gastos.service';

function makeService() {
  const repository = {
    findAll: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new GastosService(repository as any, audit as any);
  return { service, repository, audit };
}

describe('GastosService', () => {
  describe('findAll', () => {
    it('delega directo al repositorio', async () => {
      const { service, repository } = makeService();
      repository.findAll.mockResolvedValue([{ id: 'g1' }]);

      await expect(service.findAll()).resolves.toEqual([{ id: 'g1' }]);
    });
  });

  describe('create', () => {
    const dto = {
      fecha: '2026-06-15',
      concepto: 'Empaque',
      monto: 50000,
    } as any;

    it('crea el gasto con responsable/estado en null si no vienen', async () => {
      const { service, repository } = makeService();
      repository.create.mockResolvedValue({
        id: 'g1',
        concepto: 'Empaque',
        monto: 50000,
      });

      await service.create(dto);

      expect(repository.create).toHaveBeenCalledWith({
        fecha: new Date('2026-06-15'),
        concepto: 'Empaque',
        monto: 50000,
        responsable: null,
        estado: null,
      });
    });

    it('registra la creacion en auditoria', async () => {
      const { service, repository, audit } = makeService();
      repository.create.mockResolvedValue({
        id: 'g1',
        concepto: 'Empaque',
        monto: 50000,
      });

      await service.create(dto, 'user-1');

      expect(audit.log).toHaveBeenCalledWith(
        'CREAR',
        'gasto',
        'g1',
        expect.stringContaining('Empaque'),
        'user-1',
      );
    });
  });

  describe('update', () => {
    it('lanza NotFoundException si no existe', async () => {
      const { service, repository } = makeService();
      repository.findById.mockRejectedValue(
        new NotFoundException('Gasto x no encontrado'),
      );

      await expect(service.update('x', {})).rejects.toThrow(NotFoundException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('solo pasa al repositorio los campos que vienen en el dto', async () => {
      const { service, repository } = makeService();
      repository.findById.mockResolvedValue({
        id: 'g1',
        concepto: 'Empaque',
        monto: 50000,
      });
      repository.update.mockResolvedValue({
        id: 'g1',
        concepto: 'Empaque',
        monto: 60000,
      });

      await service.update('g1', { monto: 60000 });

      expect(repository.update).toHaveBeenCalledWith('g1', { monto: 60000 });
    });

    it('registra la edicion en auditoria', async () => {
      const { service, repository, audit } = makeService();
      repository.findById.mockResolvedValue({
        id: 'g1',
        concepto: 'Empaque',
        monto: 50000,
      });
      repository.update.mockResolvedValue({
        id: 'g1',
        concepto: 'Empaque',
        monto: 60000,
      });

      await service.update('g1', { monto: 60000 }, 'user-1');

      expect(audit.log).toHaveBeenCalledWith(
        'EDITAR',
        'gasto',
        'g1',
        expect.stringContaining('Empaque'),
        'user-1',
      );
    });
  });

  describe('remove', () => {
    it('lanza NotFoundException si no existe', async () => {
      const { service, repository } = makeService();
      repository.findById.mockRejectedValue(
        new NotFoundException('Gasto x no encontrado'),
      );

      await expect(service.remove('x')).rejects.toThrow(NotFoundException);
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('elimina y registra en auditoria usando los datos previos', async () => {
      const { service, repository, audit } = makeService();
      repository.findById.mockResolvedValue({
        id: 'g1',
        concepto: 'Empaque',
        monto: 50000,
      });

      await service.remove('g1', 'user-1');

      expect(repository.remove).toHaveBeenCalledWith('g1');
      expect(audit.log).toHaveBeenCalledWith(
        'ELIMINAR',
        'gasto',
        'g1',
        expect.stringContaining('Empaque'),
        'user-1',
      );
    });
  });
});
