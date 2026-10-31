import {
  BusinessRuleViolation,
  NotFoundError,
} from '../../../shared/domain/domain-error';
import { PromotionsService } from './promotions.service';

const DIA = 24 * 60 * 60 * 1000;

function promo(overrides: object = {}) {
  return {
    id: 'p1',
    nombre: 'Promo',
    alcance: 'TODOS' as const,
    porcentaje: 10,
    productosIncluidos: [],
    categoria: null,
    marca: null,
    excluidos: [],
    soloCuentaActiva: false,
    fechaInicio: new Date(Date.now() - DIA),
    fechaFin: new Date(Date.now() + DIA),
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeService() {
  const repo = {
    findAll: jest.fn(),
    findVigentes: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return { service: new PromotionsService(repo, audit), repo };
}

describe('PromotionsService', () => {
  it('marca cada promocion como vigente o no segun activo y fechas', async () => {
    const { service, repo } = makeService();
    repo.findAll.mockResolvedValue([
      promo({ id: 'vigente' }),
      promo({ id: 'inactiva', activo: false }),
      promo({ id: 'vencida', fechaFin: new Date(Date.now() - DIA) }),
    ]);

    const result = await service.findAll();

    expect(result.map((p) => [p.id, p.vigente])).toEqual([
      ['vigente', true],
      ['inactiva', false],
      ['vencida', false],
    ]);
  });

  it('findOne incluye la vigencia y lanza NotFoundError si no existe', async () => {
    const { service, repo } = makeService();
    repo.findById.mockResolvedValueOnce(promo()).mockResolvedValueOnce(null);

    await expect(service.findOne('p1')).resolves.toEqual(
      expect.objectContaining({ vigente: true }),
    );
    await expect(service.findOne('x')).rejects.toThrow(NotFoundError);
  });

  it('rechaza fechas invertidas', async () => {
    const { service } = makeService();

    await expect(
      service.create({
        nombre: 'X',
        alcance: 'TODOS',
        porcentaje: 10,
        fechaInicio: '2026-02-01',
        fechaFin: '2026-01-01',
      }),
    ).rejects.toThrow(BusinessRuleViolation);
  });
});
