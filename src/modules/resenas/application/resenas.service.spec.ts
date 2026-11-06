import {
  BusinessRuleViolation,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/domain/domain-error';
import { ResenasService } from './resenas.service';

const RECIBIDO = { productId: 'p1', nombre: 'Kosmo Skeleton 644' };

function makeService() {
  const repository = {
    findMany: jest.fn(),
    findById: jest.fn(),
    productosResenados: jest.fn().mockResolvedValue([]),
    create: jest.fn((data) => Promise.resolve({ id: 'r1', ...data })),
    update: jest.fn((id, data) =>
      Promise.resolve({
        id,
        autorNombre: 'Juan P.',
        productoNombre: RECIBIDO.nombre,
        ...data,
      }),
    ),
  };
  const compras = {
    productosRecibidos: jest.fn().mockResolvedValue([RECIBIDO]),
  };
  const autores = { nombreDe: jest.fn().mockResolvedValue('juan pérez') };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ResenasService(repository, compras, autores, audit);
  return { service, repository, compras, autores, audit };
}

const cmd = {
  productId: 'p1',
  calificacion: 5,
  comentario: 'Impecable, llegó antes de lo esperado.',
};

describe('ResenasService', () => {
  describe('pendientes', () => {
    it('devuelve lo recibido menos lo ya reseñado', async () => {
      const { service, repository, compras } = makeService();
      compras.productosRecibidos.mockResolvedValue([
        RECIBIDO,
        { productId: 'p2', nombre: 'Afnan 9 PM' },
      ]);
      repository.productosResenados.mockResolvedValue(['p1']);

      await expect(service.pendientes('u1')).resolves.toEqual([
        { productId: 'p2', nombre: 'Afnan 9 PM' },
      ]);
    });
  });

  describe('crear', () => {
    it('crea la reseña con la firma pública y el nombre del producto del pedido', async () => {
      const { service, repository } = makeService();

      await service.crear('u1', cmd);

      expect(repository.create).toHaveBeenCalledWith({
        productId: 'p1',
        productoNombre: 'Kosmo Skeleton 644',
        userId: 'u1',
        autorNombre: 'Juan P.',
        calificacion: 5,
        titulo: null,
        comentario: 'Impecable, llegó antes de lo esperado.',
      });
    });

    it('rechaza reseñar un producto que el cliente no ha recibido', async () => {
      const { service, repository, compras } = makeService();
      compras.productosRecibidos.mockResolvedValue([]);

      await expect(service.crear('u1', cmd)).rejects.toThrow(ForbiddenError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rechaza una segunda reseña del mismo producto', async () => {
      const { service, repository } = makeService();
      repository.productosResenados.mockResolvedValue(['p1']);

      await expect(service.crear('u1', cmd)).rejects.toThrow(ConflictError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('valida el contenido antes de consultar otros contextos', async () => {
      const { service, compras } = makeService();

      await expect(
        service.crear('u1', { ...cmd, calificacion: 7 }),
      ).rejects.toThrow(BusinessRuleViolation);
      expect(compras.productosRecibidos).not.toHaveBeenCalled();
    });
  });

  describe('listar', () => {
    it('pagina y arma el meta', async () => {
      const { service, repository } = makeService();
      repository.findMany.mockResolvedValue({ data: [], total: 45 });

      const res = await service.listar({
        estado: 'OCULTA',
        page: 2,
        limit: 20,
      });

      expect(repository.findMany).toHaveBeenCalledWith(
        { estado: 'OCULTA' },
        20,
        20,
      );
      expect(res.meta).toEqual({
        total: 45,
        page: 2,
        limit: 20,
        totalPages: 3,
      });
    });
  });

  describe('cambiarEstado', () => {
    it('lanza NotFoundError si no existe', async () => {
      const { service, repository } = makeService();
      repository.findById.mockResolvedValue(null);

      await expect(service.cambiarEstado('x', 'OCULTA')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('no escribe ni audita si el estado no cambia', async () => {
      const { service, repository, audit } = makeService();
      repository.findById.mockResolvedValue({ id: 'r1', estado: 'OCULTA' });

      await service.cambiarEstado('r1', 'OCULTA', 'admin');

      expect(repository.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('oculta y registra en auditoría', async () => {
      const { service, repository, audit } = makeService();
      repository.findById.mockResolvedValue({ id: 'r1', estado: 'PUBLICADA' });

      await service.cambiarEstado('r1', 'OCULTA', 'admin');

      expect(repository.update).toHaveBeenCalledWith('r1', {
        estado: 'OCULTA',
      });
      expect(audit.log).toHaveBeenCalledWith(
        'ESTADO',
        'resena',
        'r1',
        expect.stringContaining('ocultada'),
        'admin',
      );
    });
  });

  describe('responder', () => {
    it('guarda la respuesta con su fecha', async () => {
      const { service, repository } = makeService();
      repository.findById.mockResolvedValue({ id: 'r1' });

      await service.responder('r1', '  ¡Gracias, Juan!  ', 'admin');

      expect(repository.update).toHaveBeenCalledWith('r1', {
        respuesta: '¡Gracias, Juan!',
        respondidaAt: expect.any(Date),
      });
    });

    it('una respuesta vacía la retira', async () => {
      const { service, repository, audit } = makeService();
      repository.findById.mockResolvedValue({ id: 'r1' });

      await service.responder('r1', '   ', 'admin');

      expect(repository.update).toHaveBeenCalledWith('r1', {
        respuesta: null,
        respondidaAt: null,
      });
      expect(audit.log).toHaveBeenCalledWith(
        'EDITAR',
        'resena',
        'r1',
        expect.stringContaining('retirada'),
        'admin',
      );
    });
  });
});
