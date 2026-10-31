import { CatalogSyncService } from './catalog-sync.service';

function makeService(variantes: object[] = []) {
  const repo = {
    setDisponibilidadPorNombre: jest.fn(),
    renombrar: jest.fn().mockResolvedValue(0),
    findByMarcaModelo: jest.fn().mockResolvedValue(variantes),
    existsId: jest.fn().mockResolvedValue(false),
    createStub: jest.fn(),
    enable: jest.fn(),
    setMarca: jest.fn(),
  };
  const service = new CatalogSyncService(repo as any);
  return { service, repo };
}

const ingreso = {
  marca: 'Rolex',
  modelo: 'Submariner',
  categoria: 'Reloj',
  stock: 5,
  renombradoDesde: null,
};

describe('CatalogSyncService', () => {
  it('agotar deshabilita las variantes por el nombre exacto si viene, o por "marca modelo"', async () => {
    const { service, repo } = makeService();

    await service.agotar({
      marca: 'Rolex',
      modelo: 'Submariner',
      nombreProducto: 'ROLEX Submariner',
    });
    await service.agotar({
      marca: 'Rolex',
      modelo: 'Submariner',
      nombreProducto: null,
    });

    expect(repo.setDisponibilidadPorNombre.mock.calls).toEqual([
      ['ROLEX Submariner', false],
      ['Rolex Submariner', false],
    ]);
  });

  it('reponer vuelve a habilitar las variantes', async () => {
    const { service, repo } = makeService();

    await service.reponer({
      marca: null,
      modelo: 'Organizador',
      nombreProducto: null,
    });

    expect(repo.setDisponibilidadPorNombre).toHaveBeenCalledWith(
      'Organizador',
      true,
    );
  });

  describe('sincronizarIngreso', () => {
    it('crea un producto stub pendiente si hay stock y no existe ninguna variante', async () => {
      const { service, repo } = makeService([]);

      await service.sincronizarIngreso(ingreso);

      expect(repo.createStub).toHaveBeenCalledWith({
        id: 'r-rolex-submariner',
        nombre: 'Rolex Submariner',
        cat: 'reloj',
        marca: 'Rolex',
      });
    });

    it('no crea el stub si el id ya existe (colision de slug), sin romper la transaccion', async () => {
      const { service, repo } = makeService([]);
      repo.existsId.mockResolvedValue(true);

      await service.sincronizarIngreso(ingreso);

      expect(repo.createStub).not.toHaveBeenCalled();
    });

    it('no crea producto si no hay stock disponible', async () => {
      const { service, repo } = makeService([]);

      await service.sincronizarIngreso({ ...ingreso, stock: 0 });
      await service.sincronizarIngreso({ ...ingreso, stock: null });

      expect(repo.findByMarcaModelo).not.toHaveBeenCalled();
      expect(repo.createStub).not.toHaveBeenCalled();
    });

    it('habilita variantes deshabilitadas y completa la marca faltante', async () => {
      const { service, repo } = makeService([
        { id: 'a', disponible: false, marca: null },
        { id: 'b', disponible: true, marca: 'Rolex' },
      ]);

      await service.sincronizarIngreso(ingreso);

      expect(repo.enable).toHaveBeenCalledWith(['a']);
      expect(repo.setMarca).toHaveBeenCalledWith(['a'], 'Rolex');
      expect(repo.createStub).not.toHaveBeenCalled();
    });

    it('con renombre, renombra el producto existente en vez de crear uno nuevo', async () => {
      const { service, repo } = makeService();
      repo.renombrar.mockResolvedValue(1);

      await service.sincronizarIngreso({
        ...ingreso,
        modelo: 'Daytona',
        renombradoDesde: { marca: 'Rolex', modelo: 'Submariner' },
      });

      expect(repo.renombrar).toHaveBeenCalledWith(
        'Rolex Submariner',
        'Rolex Daytona',
        'Rolex',
      );
      expect(repo.findByMarcaModelo).not.toHaveBeenCalled();
    });

    it('con renombre pero nada que renombrar, cae a la sincronizacion normal', async () => {
      const { service, repo } = makeService([]);

      await service.sincronizarIngreso({
        ...ingreso,
        modelo: 'Daytona',
        renombradoDesde: { marca: 'Rolex', modelo: 'Submariner' },
      });

      expect(repo.createStub).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Rolex Daytona' }),
      );
    });
  });
});
