import { NotFoundError } from '../../../shared/domain/domain-error';
import { fakeEventBus, fakeUnitOfWork } from '../../../shared/testing/fakes';
import { VentaEliminada, VentaManualRegistrada } from '../domain/venta-events';
import { VentasService } from './ventas.service';

function makeService() {
  const repository = {
    findById: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    removeByOrderId: jest.fn(),
    modelosVendidos: jest.fn(),
  };
  const uow = fakeUnitOfWork();
  const events = fakeEventBus();
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new VentasService(repository, uow, events, audit);
  return { service, repository, uow, events, audit };
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

  it('publica VentaManualRegistrada dentro de la transaccion (inventario descuenta stock)', async () => {
    const { service, repository, uow, events } = makeService();
    repository.create.mockResolvedValue({ id: 'venta-1' });

    await service.create(dtoBase);

    expect(uow.run).toHaveBeenCalledTimes(1);
    expect(events.of(VentaManualRegistrada)[0].venta).toEqual(
      expect.objectContaining({
        ventaId: 'venta-1',
        marca: 'Rolex',
        modelo: 'Submariner',
        precioVenta: 1000,
      }),
    );
  });

  it('marca la venta como elegible para Meta solo con canal digital y celular', async () => {
    const { service, repository, events } = makeService();
    repository.create.mockResolvedValue({ id: 'venta-1' });

    await service.create({
      ...dtoBase,
      fuente: 'WhatsApp',
      celular: '3000000000',
    });
    await service.create({ ...dtoBase, fuente: 'WhatsApp' });

    expect(
      events.of(VentaManualRegistrada).map((e) => e.venta.elegibleMetaOffline),
    ).toEqual([true, false]);
  });
});

describe('VentasService.update', () => {
  it('propaga NotFoundError si no existe', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue(null);

    await expect(service.update('x', {})).rejects.toThrow(NotFoundError);
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
  it('propaga NotFoundError si no existe', async () => {
    const { service, repository } = makeService();
    repository.findById.mockResolvedValue(null);

    await expect(service.remove('x')).rejects.toThrow(NotFoundError);
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('elimina, publica VentaEliminada y audita usando los datos previos', async () => {
    const { service, repository, events, audit } = makeService();
    repository.findById.mockResolvedValue({
      id: 'venta-1',
      marca: 'Rolex',
      modelo: 'Submariner',
      cliente: 'Ana',
    });

    const result = await service.remove('venta-1', 'user-1');

    expect(repository.remove).toHaveBeenCalledWith('venta-1');
    expect(events.of(VentaEliminada)[0].venta).toEqual({
      ventaId: 'venta-1',
      marca: 'Rolex',
      modelo: 'Submariner',
    });
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
