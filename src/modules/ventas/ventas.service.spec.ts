import { NotFoundException } from '@nestjs/common';
import { VentasService } from './ventas.service';

function makeService() {
  const repository = {
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const metaConversions = {
    sendOfflinePurchase: jest.fn().mockResolvedValue(undefined),
  };
  const service = new VentasService(
    repository as any,
    audit as any,
    metaConversions as any,
  );
  return { service, repository, audit, metaConversions };
}

const dtoBase = {
  fecha: '2026-01-01',
  cliente: 'Ana Gomez',
  marca: 'Rolex',
  modelo: 'Submariner',
  precioVenta: 1000,
  costoProducto: 600,
  costoEnvio: 0,
  abono: 1000,
  estado: 'Pagado',
} as any;

describe('VentasService.create', () => {
  it('calcula saldoPendiente y lo pasa al repositorio', async () => {
    const { service, repository } = makeService();
    repository.create.mockResolvedValue({ id: 'venta-1' });

    await service.create({ ...dtoBase, abono: 400 });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ saldoPendiente: 600 }),
    );
  });

  it('registra la creacion en auditoria', async () => {
    const { service, repository, audit } = makeService();
    repository.create.mockResolvedValue({ id: 'venta-1' });

    await service.create(dtoBase, 'user-1');

    expect(audit.log).toHaveBeenCalledWith(
      'CREAR',
      'venta',
      'venta-1',
      expect.stringContaining('Rolex Submariner'),
      'user-1',
    );
  });

  it('envia el evento offline a Meta cuando la venta es elegible', async () => {
    const { service, repository, metaConversions } = makeService();
    repository.create.mockResolvedValue({ id: 'venta-1' });

    await service.create({
      ...dtoBase,
      fuente: 'WhatsApp',
      celular: '3000000000',
    });

    expect(metaConversions.sendOfflinePurchase).toHaveBeenCalledWith(
      expect.objectContaining({ ventaId: 'venta-1', total: 1000 }),
    );
  });

  it('no envia nada a Meta si no es elegible (sin celular)', async () => {
    const { service, repository, metaConversions } = makeService();
    repository.create.mockResolvedValue({ id: 'venta-1' });

    await service.create({ ...dtoBase, fuente: 'WhatsApp' });

    expect(metaConversions.sendOfflinePurchase).not.toHaveBeenCalled();
  });
});

describe('VentasService.update', () => {
  it('propaga NotFoundException si no existe', async () => {
    const { service, repository } = makeService();
    repository.findById.mockRejectedValue(
      new NotFoundException('Venta x no encontrada'),
    );

    await expect(service.update('x', {})).rejects.toThrow(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('pasa el plan calculado al repositorio', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue({
      fecha: new Date('2026-01-01'),
      cliente: 'Ana',
      celular: null,
      marca: 'Rolex',
      modelo: 'Submariner',
      estilo: null,
      precioVenta: 1000,
      costoProducto: 600,
      costoEnvio: 0,
      abono: 400,
      fuente: null,
      estado: 'Abonado',
    });
    repository.update.mockResolvedValue({
      id: 'venta-1',
      modelo: 'Submariner',
      cliente: 'Ana',
    });

    await service.update('venta-1', { abono: 1000 });

    expect(repository.update).toHaveBeenCalledWith(
      'venta-1',
      expect.objectContaining({
        abono: 1000,
        estado: 'Pagado',
        saldoPendiente: 0,
      }),
    );
  });

  it('registra la edicion en auditoria', async () => {
    const { service, repository, audit } = makeService();
    repository.findById.mockResolvedValue({
      fecha: new Date('2026-01-01'),
      cliente: 'Ana',
      celular: null,
      marca: 'Rolex',
      modelo: 'Submariner',
      estilo: null,
      precioVenta: 1000,
      costoProducto: 600,
      costoEnvio: 0,
      abono: 400,
      fuente: null,
      estado: 'Abonado',
    });
    repository.update.mockResolvedValue({
      id: 'venta-1',
      modelo: 'Submariner',
      cliente: 'Ana',
    });

    await service.update('venta-1', { abono: 1000 }, 'user-1');

    expect(audit.log).toHaveBeenCalledWith(
      'EDITAR',
      'venta',
      'venta-1',
      expect.stringContaining('Submariner'),
      'user-1',
    );
  });
});

describe('VentasService.remove', () => {
  it('propaga NotFoundException si no existe', async () => {
    const { service, repository } = makeService();
    repository.findById.mockRejectedValue(
      new NotFoundException('Venta x no encontrada'),
    );

    await expect(service.remove('x')).rejects.toThrow(NotFoundException);
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('elimina y registra en auditoria usando los datos previos', async () => {
    const { service, repository, audit } = makeService();
    repository.findById.mockResolvedValue({
      id: 'venta-1',
      marca: 'Rolex',
      modelo: 'Submariner',
      cliente: 'Ana',
    });

    const result = await service.remove('venta-1', 'user-1');

    expect(repository.remove).toHaveBeenCalledWith(
      'venta-1',
      expect.objectContaining({ modelo: 'Submariner' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      'ELIMINAR',
      'venta',
      'venta-1',
      expect.stringContaining('Submariner'),
      'user-1',
    );
    expect(result).toEqual({ mensaje: 'Venta eliminada correctamente' });
  });
});
