import { CostosSyncService } from './costos-sync.service';

function makeService(existente: object | null = null) {
  const repo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByModelo: jest.fn().mockResolvedValue(existente),
    create: jest.fn(),
    update: jest.fn(),
    upsertPorModelo: jest.fn(),
    borrarHuerfanosSinPrecioManual: jest.fn(),
  };
  const service = new CostosSyncService(repo);
  return { service, repo };
}

const compra = { marca: 'Rolex', modelo: 'Submariner', costoUnitario: 900 };

describe('CostosSyncService', () => {
  it('la primera compra de un modelo crea su fila con el costo adicional por defecto', async () => {
    const { service, repo } = makeService(null);

    await service.compraRegistrada(compra);

    expect(repo.create).toHaveBeenCalledWith({
      marca: 'Rolex',
      modelo: 'Submariner',
      costoUnitario: 900,
      costoAdicional: 25028,
      costoTotal: 25928,
    });
  });

  it('las compras siguientes del mismo modelo no tocan el precio', async () => {
    const { service, repo } = makeService({ id: 'p1' });

    await service.compraRegistrada(compra);

    expect(repo.create).not.toHaveBeenCalled();
  });

  it('una correccion de costo actualiza la fila conservando su costo adicional', async () => {
    const { service, repo } = makeService({ id: 'p1', costoAdicional: 30000 });

    await service.compraCorregida({
      anterior: { modelo: 'Submariner' },
      nueva: { ...compra, costoUnitario: 1000 },
      modeloCambio: false,
      actualizarPrecio: true,
    });

    expect(repo.update).toHaveBeenCalledWith('p1', {
      marca: 'Rolex',
      modelo: 'Submariner',
      costoUnitario: 1000,
      costoTotal: 31000,
    });
  });

  it('si cambio el modelo, busca la fila por el modelo anterior', async () => {
    const { service, repo } = makeService(null);

    await service.compraCorregida({
      anterior: { modelo: 'Submariner' },
      nueva: { ...compra, modelo: 'Daytona' },
      modeloCambio: true,
      actualizarPrecio: true,
    });

    expect(repo.findByModelo).toHaveBeenCalledWith('Submariner');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ modelo: 'Daytona' }),
    );
  });

  it('sin cambios de costo ni identidad, no toca precios', async () => {
    const { service, repo } = makeService({ id: 'p1' });

    await service.compraCorregida({
      anterior: { modelo: 'Submariner' },
      nueva: compra,
      modeloCambio: false,
      actualizarPrecio: false,
    });

    expect(repo.findByModelo).not.toHaveBeenCalled();
  });

  it('el recalculo de inventario borra huerfanos sin precio manual y hace upsert de cada fila', async () => {
    const { service, repo } = makeService();
    const fila = {
      marca: 'Rolex',
      modelo: 'Submariner',
      costoUnitario: 600,
      costoAdicional: 25028,
      costoTotal: 25628,
    };

    await service.inventarioRecalculado({
      modelosActivos: ['Submariner'],
      filas: [fila],
    });

    expect(repo.borrarHuerfanosSinPrecioManual).toHaveBeenCalledWith([
      'Submariner',
    ]);
    // costoAdicional solo al crear: no pisa el que el admin haya ajustado
    expect(repo.upsertPorModelo).toHaveBeenCalledWith(
      'Submariner',
      { marca: 'Rolex', costoUnitario: 600, costoTotal: 25628 },
      fila,
    );
  });
});
