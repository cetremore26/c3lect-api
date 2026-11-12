import { EstadoPago, reglaDeTransicion } from '../../domain/payment-status';
import { PrismaPaymentRepository } from './prisma-payment.repository';

function makeRepo(count = 1) {
  const updateMany = jest.fn().mockResolvedValue({ count });
  const repo = new PrismaPaymentRepository({
    client: { payment: { updateMany, findUnique: jest.fn() } },
  } as never);
  return { repo, updateMany };
}

describe('PrismaPaymentRepository.transicionar', () => {
  it('transicionar filtra por los estados de origen de la regla', async () => {
    const { repo, updateMany } = makeRepo();

    const ok = await repo.transicionar({
      paymentId: 'p1',
      nuevoEstado: EstadoPago.APROBADO,
      mpPaymentId: 'mp-1',
      regla: reglaDeTransicion(EstadoPago.APROBADO),
    });

    expect(ok).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'p1',
        estado: {
          in: [
            EstadoPago.PENDIENTE,
            EstadoPago.RECHAZADO,
            EstadoPago.CANCELADO,
          ],
        },
      },
      data: { estado: EstadoPago.APROBADO, mpPaymentId: 'mp-1' },
    });
  });

  it('transicionar a REEMBOLSADO exige el mismo mpPaymentId', async () => {
    const { repo, updateMany } = makeRepo();

    await repo.transicionar({
      paymentId: 'p1',
      nuevoEstado: EstadoPago.REEMBOLSADO,
      mpPaymentId: 'mp-1',
      regla: reglaDeTransicion(EstadoPago.REEMBOLSADO),
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'p1',
        estado: { in: [EstadoPago.APROBADO] },
        mpPaymentId: 'mp-1',
      },
      data: { estado: EstadoPago.REEMBOLSADO, mpPaymentId: 'mp-1' },
    });
  });

  it('transicionar devuelve false si no actualizo ninguna fila', async () => {
    const { repo } = makeRepo(0);

    const ok = await repo.transicionar({
      paymentId: 'p1',
      nuevoEstado: EstadoPago.APROBADO,
      mpPaymentId: 'mp-1',
      regla: reglaDeTransicion(EstadoPago.APROBADO),
    });

    expect(ok).toBe(false);
  });
});
