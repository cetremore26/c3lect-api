import { NotFoundError } from '../../../shared/domain/domain-error';
import { fakeEventBus, fakeUnitOfWork } from '../../../shared/testing/fakes';
import { CompraCorregida, CompraRegistrada } from '../domain/compra-events';
import { ComprasService } from './compras.service';

function makeService() {
  const repository = {
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findAllParaInventario: jest.fn(),
    findMarcas: jest.fn(),
  };
  const uow = fakeUnitOfWork();
  const events = fakeEventBus();
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ComprasService(repository, uow, events, audit);
  return { service, repository, uow, events, audit };
}

const existente = {
  id: 'compra-1',
  fecha: new Date('2026-01-01'),
  marca: 'Rolex',
  modelo: 'Submariner',
  cantidad: 5,
  costoUnitario: 900,
  costoTotal: 4500,
  categoria: 'Reloj',
  createdAt: new Date('2026-01-01'),
};

describe('ComprasService.create', () => {
  const dto = {
    fecha: '2026-01-01',
    marca: 'Rolex',
    modelo: 'Submariner',
    cantidad: 5,
    costoUnitario: 900,
    categoria: 'Reloj',
  };

  it('calcula costoTotal y lo pasa al repositorio', async () => {
    const { service, repository } = makeService();
    repository.create.mockResolvedValue({ id: 'compra-1' });

    await service.create(dto);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ costoTotal: 4500 }),
    );
  });

  it('publica CompraRegistrada dentro de la misma unidad de trabajo', async () => {
    const { service, repository, uow, events } = makeService();
    repository.create.mockResolvedValue({ id: 'compra-1' });

    await service.create(dto);

    expect(uow.run).toHaveBeenCalledTimes(1);
    expect(events.of(CompraRegistrada)).toEqual([
      new CompraRegistrada({
        compraId: 'compra-1',
        marca: 'Rolex',
        modelo: 'Submariner',
        cantidad: 5,
        costoUnitario: 900,
        categoria: 'Reloj',
      }),
    ]);
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
    repository.findById.mockResolvedValue(existente);
    repository.update.mockResolvedValue({ id: 'compra-1' });

    await service.update('compra-1', { cantidad: 8 });

    expect(repository.update).toHaveBeenCalledWith(
      'compra-1',
      expect.objectContaining({ cantidad: 8, costoTotal: 7200 }),
    );
  });

  it('publica CompraCorregida con la identidad anterior y la nueva', async () => {
    const { service, repository, events } = makeService();
    repository.findById.mockResolvedValue(existente);
    repository.update.mockResolvedValue({ id: 'compra-1' });

    await service.update('compra-1', { modelo: 'Daytona', cantidad: 2 });

    const [evento] = events.of(CompraCorregida);
    expect(evento.correccion).toEqual({
      compraId: 'compra-1',
      anterior: { marca: 'Rolex', modelo: 'Submariner', cantidad: 5 },
      nueva: {
        marca: 'Rolex',
        modelo: 'Daytona',
        cantidad: 2,
        costoUnitario: 900,
        categoria: 'Reloj',
      },
      modeloCambio: true,
      identidadCambio: true,
      actualizarPrecio: true,
    });
  });

  it('registra la edicion en auditoria', async () => {
    const { service, repository, audit } = makeService();
    repository.findById.mockResolvedValue(existente);
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

  it('lanza NotFoundError si la compra no existe, sin tocar nada', async () => {
    const { service, repository, events } = makeService();
    repository.findById.mockResolvedValue(null);

    await expect(service.update('x', {})).rejects.toThrow(NotFoundError);
    expect(repository.update).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
});
