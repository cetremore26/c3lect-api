import { AccountRepository } from './account.repository';

// Verifica la invariante "una sola principal a la vez" en el unico lugar
// donde ahora vive (clearPrincipal, ejecutado dentro de la transaccion).
describe('AccountRepository', () => {
  function makeTx() {
    return {
      address: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest
          .fn()
          .mockResolvedValue({ id: 'addr-2', esPrincipal: true }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'addr-1', esPrincipal: true }),
      },
    };
  }

  function makeRepository() {
    const tx = makeTx();
    const prisma = {
      address: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'addr-1', esPrincipal: false }),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue(undefined),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const repository = new AccountRepository(prisma as any);
    return { repository, tx, prisma };
  }

  const data = {
    alias: 'Casa',
    ciudad: 'Medellín',
    departamento: 'Antioquia',
    direccion: 'Calle 1',
  };

  describe('createAddress', () => {
    it('sin marcar principal, crea directo sin transaccion', async () => {
      const { repository, prisma } = makeRepository();

      await repository.createAddress('user-1', data, false);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.address.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', ...data, esPrincipal: false },
      });
    });

    it('marcando principal, desmarca las demas del usuario antes de crear', async () => {
      const { repository, tx } = makeRepository();

      await repository.createAddress('user-1', data, true);

      expect(tx.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', esPrincipal: true },
        data: { esPrincipal: false },
      });
      expect(tx.address.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', ...data, esPrincipal: true },
      });
    });
  });

  describe('updateAddress', () => {
    it('marcando principal, desmarca las demas del usuario antes de actualizar', async () => {
      const { repository, tx } = makeRepository();

      await repository.updateAddress('user-1', 'addr-1', data, true);

      expect(tx.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', esPrincipal: true },
        data: { esPrincipal: false },
      });
      expect(tx.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
        data: { ...data, esPrincipal: true },
      });
    });
  });

  describe('setPrincipal', () => {
    it('desmarca las demas del usuario antes de marcar esta', async () => {
      const { repository, tx } = makeRepository();

      await repository.setPrincipal('user-1', 'addr-1');

      expect(tx.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', esPrincipal: true },
        data: { esPrincipal: false },
      });
      expect(tx.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
        data: { esPrincipal: true },
      });
    });
  });

  describe('deleteAddress', () => {
    it('si no era la principal, no promueve ninguna otra', async () => {
      const { repository, prisma } = makeRepository();

      await repository.deleteAddress('user-1', 'addr-1', false);

      expect(prisma.address.delete).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
      });
      expect(prisma.address.findFirst).not.toHaveBeenCalled();
    });

    it('si era la principal y quedan otras, promueve la mas antigua', async () => {
      const { repository, prisma } = makeRepository();
      prisma.address.findFirst.mockResolvedValue({ id: 'addr-2' });

      await repository.deleteAddress('user-1', 'addr-1', true);

      expect(prisma.address.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(prisma.address.update).toHaveBeenCalledWith({
        where: { id: 'addr-2' },
        data: { esPrincipal: true },
      });
    });

    it('si era la principal y no quedan otras, no promueve nada', async () => {
      const { repository, prisma } = makeRepository();
      prisma.address.findFirst.mockResolvedValue(null);

      await repository.deleteAddress('user-1', 'addr-1', true);

      expect(prisma.address.update).not.toHaveBeenCalled();
    });
  });
});
