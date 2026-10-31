import { fakeEventBus, fakeUnitOfWork } from '../../../shared/testing/fakes';
import { InventarioRecalculado } from '../domain/inventario-events';
import { InventarioService } from './inventario.service';

function makeService() {
  const repository = {
    findAll: jest.fn(),
    findStockPublico: jest.fn(),
    applySeed: jest.fn(),
  };
  const compras = { listar: jest.fn() };
  const ventas = { modelosVendidos: jest.fn() };
  const uow = fakeUnitOfWork();
  const events = fakeEventBus();
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new InventarioService(
    repository as any,
    compras,
    ventas,
    uow,
    events,
    audit,
  );
  return { service, repository, compras, ventas, uow, events, audit };
}

describe('InventarioService.findAll', () => {
  it('agrega capitalItem como stock por costoUnitario', async () => {
    const { service, repository } = makeService();
    repository.findAll.mockResolvedValue([
      { id: '1', modelo: 'Submariner', stock: 3, costoUnitario: 600 },
    ]);

    const [item] = await service.findAll();

    expect(item.capitalItem).toBe(1800);
  });
});

describe('InventarioService.stockPublico', () => {
  it('delega directo al repositorio', async () => {
    const { service, repository } = makeService();
    repository.findStockPublico.mockResolvedValue([
      { modelo: 'Submariner', stock: 3 },
    ]);

    await expect(service.stockPublico()).resolves.toEqual([
      { modelo: 'Submariner', stock: 3 },
    ]);
    expect(repository.findStockPublico).toHaveBeenCalled();
  });
});

describe('InventarioService.seed', () => {
  it('arma las filas combinando compras agrupadas y ventas, con el floor de stock en 0', async () => {
    const { service, repository, compras, ventas } = makeService();
    compras.listar.mockResolvedValue([
      {
        marca: 'Rolex',
        modelo: 'Submariner',
        cantidad: 5,
        costoUnitario: 600,
        categoria: 'Reloj',
      },
      {
        marca: 'Casio',
        modelo: 'G-Shock',
        cantidad: 2,
        costoUnitario: 80,
        categoria: 'Reloj',
      },
    ]);
    ventas.modelosVendidos.mockResolvedValue([
      { modelo: 'Submariner' },
      { modelo: 'Submariner' },
      { modelo: 'Submariner' },
      { modelo: 'Submariner' },
      { modelo: 'Submariner' },
      { modelo: 'Submariner' },
      { modelo: 'G-Shock' },
    ]);
    repository.applySeed.mockResolvedValue(2);

    await service.seed('admin-1');

    expect(repository.applySeed).toHaveBeenCalledWith(
      ['Submariner', 'G-Shock'],
      [
        {
          modelo: 'Submariner',
          marca: 'Rolex',
          stock: 0, // 5 compradas, 6 vendidas -> floor en 0
          costoUnitario: 600,
          categoria: 'Reloj',
        },
        {
          modelo: 'G-Shock',
          marca: 'Casio',
          stock: 1, // 2 compradas, 1 vendida
          costoUnitario: 80,
          categoria: 'Reloj',
        },
      ],
    );
  });

  it('devuelve el conteo de modelos y la lista de modelos activos', async () => {
    const { service, repository, compras, ventas } = makeService();
    compras.listar.mockResolvedValue([
      {
        marca: 'Rolex',
        modelo: 'Submariner',
        cantidad: 1,
        costoUnitario: 600,
        categoria: 'Reloj',
      },
    ]);
    ventas.modelosVendidos.mockResolvedValue([]);
    repository.applySeed.mockResolvedValue(1);

    const result = await service.seed();

    expect(result).toEqual({ seeded: 1, modelos: ['Submariner'] });
  });

  it('registra en auditoria el recalculo con el userId y el conteo', async () => {
    const { service, repository, compras, ventas, audit } = makeService();
    compras.listar.mockResolvedValue([
      {
        marca: 'Rolex',
        modelo: 'Submariner',
        cantidad: 1,
        costoUnitario: 600,
        categoria: 'Reloj',
      },
    ]);
    ventas.modelosVendidos.mockResolvedValue([]);
    repository.applySeed.mockResolvedValue(1);

    await service.seed('admin-1');

    expect(audit.log).toHaveBeenCalledWith(
      'RECALCULAR',
      'inventario',
      'seed',
      expect.stringContaining('1 modelo(s)'),
      'admin-1',
    );
  });

  it('sin compras, no llama a applySeed con modelos y aun asi audita con 0', async () => {
    const { service, repository, compras, ventas, audit } = makeService();
    compras.listar.mockResolvedValue([]);
    ventas.modelosVendidos.mockResolvedValue([]);
    repository.applySeed.mockResolvedValue(0);

    const result = await service.seed();

    expect(repository.applySeed).toHaveBeenCalledWith([], []);
    expect(result).toEqual({ seeded: 0, modelos: [] });
    expect(audit.log).toHaveBeenCalledWith(
      'RECALCULAR',
      'inventario',
      'seed',
      expect.stringContaining('0 modelo(s)'),
      undefined,
    );
  });

  it('publica InventarioRecalculado dentro de la transaccion del seed', async () => {
    const { service, repository, compras, ventas, uow, events } = makeService();
    compras.listar.mockResolvedValue([
      {
        marca: 'Rolex',
        modelo: 'Submariner',
        cantidad: 1,
        costoUnitario: 600,
        categoria: 'Reloj',
      },
    ]);
    ventas.modelosVendidos.mockResolvedValue([]);
    repository.applySeed.mockResolvedValue(1);

    await service.seed();

    expect(uow.run).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 15000,
    });
    expect(events.of(InventarioRecalculado)[0].recalculo).toEqual({
      modelosActivos: ['Submariner'],
      filas: [
        {
          marca: 'Rolex',
          modelo: 'Submariner',
          costoUnitario: 600,
        },
      ],
    });
  });
});
