import { Logger } from '@nestjs/common';
import { DomainEvent } from '../../domain/domain-event';
import { PrismaTransactionHost } from '../prisma/prisma-transaction.host';
import { InProcessEventBus } from './in-process-event-bus';

class AlgoPaso implements DomainEvent {
  static readonly NAME = 'test.algo-paso';
  readonly name = AlgoPaso.NAME;
  constructor(readonly valor: number) {}
}

class OtraCosa implements DomainEvent {
  static readonly NAME = 'test.otra-cosa';
  readonly name = OtraCosa.NAME;
}

// Host real sobre un Prisma falso: $transaction ejecuta el callback y, si
// lanza, propaga (como un rollback). Así se prueba la interacción real entre
// la transacción ambiental y las fases del bus.
function makeBus() {
  const prisma = {
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work({ soyElTx: true }),
    ),
  };
  const host = new PrismaTransactionHost(prisma as any);
  const bus = new InProcessEventBus(host);
  return { bus, host };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('InProcessEventBus', () => {
  let logError: jest.SpyInstance;

  beforeEach(() => {
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('entrega cada evento solo a los handlers de su tipo', async () => {
    const { bus } = makeBus();
    const algo = jest.fn();
    const otra = jest.fn();
    bus.subscribe(AlgoPaso, algo, 'in-transaction');
    bus.subscribe(OtraCosa, otra, 'in-transaction');

    await bus.publish(new AlgoPaso(1));

    expect(algo).toHaveBeenCalledWith(new AlgoPaso(1));
    expect(otra).not.toHaveBeenCalled();
  });

  it('corre los handlers in-transaction en orden y esperando a cada uno', async () => {
    const { bus } = makeBus();
    const orden: string[] = [];
    bus.subscribe(
      AlgoPaso,
      async () => {
        await tick();
        orden.push('primero');
      },
      'in-transaction',
    );
    bus.subscribe(AlgoPaso, () => void orden.push('segundo'), 'in-transaction');

    await bus.publish(new AlgoPaso(1));

    expect(orden).toEqual(['primero', 'segundo']);
  });

  it('un handler in-transaction que lanza aborta la unidad de trabajo', async () => {
    const { bus, host } = makeBus();
    const despues = jest.fn();
    bus.subscribe(
      AlgoPaso,
      () => {
        throw new Error('stock insuficiente');
      },
      'in-transaction',
    );
    bus.subscribe(AlgoPaso, despues, 'after-commit');

    await expect(
      host.run(async () => {
        await bus.publish(new AlgoPaso(1));
      }),
    ).rejects.toThrow('stock insuficiente');

    await tick();
    expect(despues).not.toHaveBeenCalled();
  });

  it('los handlers in-transaction ven el cliente de la transaccion en curso', async () => {
    const { bus, host } = makeBus();
    let clienteVisto: unknown;
    bus.subscribe(
      AlgoPaso,
      () => {
        clienteVisto = host.client;
      },
      'in-transaction',
    );

    await host.run(() => bus.publish(new AlgoPaso(1)));

    expect(clienteVisto).toEqual({ soyElTx: true });
  });

  it('difiere los handlers after-commit hasta que la transaccion confirma', async () => {
    const { bus, host } = makeBus();
    const correo = jest.fn();
    bus.subscribe(AlgoPaso, correo, 'after-commit');

    await host.run(async () => {
      await bus.publish(new AlgoPaso(1));
      await tick();
      expect(correo).not.toHaveBeenCalled();
    });

    await tick();
    expect(correo).toHaveBeenCalledWith(new AlgoPaso(1));
  });

  it('nunca corre los after-commit si la transaccion termina en rollback', async () => {
    const { bus, host } = makeBus();
    const correo = jest.fn();
    bus.subscribe(AlgoPaso, correo, 'after-commit');

    await expect(
      host.run(async () => {
        await bus.publish(new AlgoPaso(1));
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    await tick();
    expect(correo).not.toHaveBeenCalled();
  });

  it('sin transaccion, after-commit corre de inmediato sin bloquear al publicador', async () => {
    const { bus } = makeBus();
    let terminado = false;
    bus.subscribe(
      AlgoPaso,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        terminado = true;
      },
      'after-commit',
    );

    await bus.publish(new AlgoPaso(1));

    expect(terminado).toBe(false);
  });

  it('un after-commit que falla se registra pero no afecta al publicador', async () => {
    const { bus } = makeBus();
    bus.subscribe(
      AlgoPaso,
      () => {
        throw new Error('Resend caido');
      },
      'after-commit',
    );

    await expect(bus.publish(new AlgoPaso(1))).resolves.toBeUndefined();
    await tick();
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining(AlgoPaso.NAME),
      expect.stringContaining('Resend caido'),
    );
  });
});

describe('PrismaTransactionHost', () => {
  it('fuera de una unidad de trabajo, client es el PrismaService', () => {
    const prisma = { $transaction: jest.fn() };
    const host = new PrismaTransactionHost(prisma as any);

    expect(host.client).toBe(prisma);
  });

  it('las unidades de trabajo anidadas se unen a la transaccion en curso', async () => {
    const { host } = makeBus();
    const prisma = (host as unknown as { prisma: { $transaction: jest.Mock } })
      .prisma;

    await host.run(() => host.run(() => host.run(() => Promise.resolve())));

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('pasa las opciones (timeout) a la transaccion de Prisma', async () => {
    const { host } = makeBus();
    const prisma = (host as unknown as { prisma: { $transaction: jest.Mock } })
      .prisma;

    await host.run(() => Promise.resolve(), { timeout: 15000 });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 15000,
    });
  });
});
