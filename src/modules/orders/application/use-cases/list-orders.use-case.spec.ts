import { ListOrdersUseCase } from './list-orders.use-case';

describe('ListOrdersUseCase', () => {
  it('interpreta fechaDesde/fechaHasta como días de Bogotá', async () => {
    const orders = {
      findMany: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };
    const useCase = new ListOrdersUseCase(orders as any);

    await useCase.execute(
      { fechaDesde: '2026-11-01', fechaHasta: '2026-11-10' },
      { userId: 'a', rol: 'ADMIN' },
    );

    const [filtro] = orders.findMany.mock.calls[0];
    expect(filtro.fechaDesde.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(filtro.fechaHasta.toISOString()).toBe('2026-11-11T04:59:59.999Z');
  });
});
