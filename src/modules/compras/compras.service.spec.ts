import { NotFoundException } from '@nestjs/common';
import { ComprasService } from './compras.service';

function makeService() {
  const repository = {
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ComprasService(repository as any, audit as any);
  return { service, repository, audit };
}

describe('ComprasService.create', () => {
  const dto = {
    fecha: '2026-01-01',
    marca: 'Rolex',
    modelo: 'Submariner',
    cantidad: 5,
    costoUnitario: 900,
    categoria: 'Reloj',
  } as any;

  it('calcula costoTotal y lo pasa al repositorio', async () => {
    const { service, repository } = makeService();
    repository.create.mockResolvedValue({ id: 'compra-1' });

    await service.create(dto);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ costoTotal: 4500 }),
    );
  });

  it('registra la creacion en auditoria con el total formateado', async () => {
    const { service, repository, audit } = makeService();
    repository.create.mockResolvedValue({ id: 'compra-1' });

    await service.create(dto, 'user-1');

    expect(audit.log).toHaveBeenCalledWith(
      'CREAR',
      'compra',
      'compra-1',
      expect.stringContaining('Rolex Submariner'),
      'user-1',
    );
  });
});

describe('ComprasService.update', () => {
  it('arma el plan a partir de lo existente y lo pasa al repositorio', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      fecha: new Date('2026-01-01'),
      marca: 'Rolex',
      modelo: 'Submariner',
      cantidad: 5,
      costoUnitario: 900,
      categoria: 'Reloj',
    });
    repository.update.mockResolvedValue({ id: 'compra-1' });

    await service.update('compra-1', { cantidad: 8 });

    expect(repository.update).toHaveBeenCalledWith(
      'compra-1',
      expect.objectContaining({ modelo: 'Submariner' }),
      expect.objectContaining({ cantidad: 8, costoTotal: 7200 }),
    );
  });

  it('registra la edicion en auditoria', async () => {
    const { service, repository, audit } = makeService();
    repository.findById.mockResolvedValue({
      fecha: new Date('2026-01-01'),
      marca: 'Rolex',
      modelo: 'Submariner',
      cantidad: 5,
      costoUnitario: 900,
      categoria: 'Reloj',
    });
    repository.update.mockResolvedValue({ id: 'compra-1' });

    await service.update('compra-1', { cantidad: 8 }, 'user-1');

    expect(audit.log).toHaveBeenCalledWith(
      'EDITAR',
      'compra',
      'compra-1',
      expect.stringContaining('Rolex Submariner'),
      'user-1',
    );
  });

  it('propaga NotFoundException si el repositorio no encuentra la compra', async () => {
    const { service, repository } = makeService();
    repository.findById.mockRejectedValue(
      new NotFoundException('Compra x no encontrada'),
    );

    await expect(service.update('x', {})).rejects.toThrow(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
