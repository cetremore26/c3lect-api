import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import type { NewOrderData } from '../../application/ports/order-repository.port';
import { EstadoPedido, MetodoPago } from '../../domain/order-status';
import { PrismaOrderRepository } from './prisma-order.repository';

// Test de integración contra una base local. Sin la variable, se omite.
// NUNCA apuntarla a producción. Sin transacción envolvente: la concurrencia
// necesita commits reales; los pedidos de prueba se borran en afterAll.
//   INTEGRATION_DATABASE_URL=postgresql://... pnpm test:int
const url = process.env.INTEGRATION_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

function nuevoPedido(overrides: Partial<NewOrderData> = {}): NewOrderData {
  return {
    orderNumber: `C3L-TEST-${randomUUID().slice(0, 8)}`,
    userId: null,
    subtotal: 1000,
    total: 1000,
    paymentMethod: MetodoPago.CONTRAENTREGA,
    fbp: null,
    fbc: null,
    items: [
      {
        productId: 'prod-test',
        nombre: 'Producto de prueba',
        precioUnitario: 1000,
        cantidad: 1,
        subtotal: 1000,
      },
    ],
    shippingInfo: {
      nombreCompleto: 'Cliente Test',
      email: 'cliente@test.local',
      telefono: '3000000000',
      ciudad: 'Bogotá',
      departamento: 'Cundinamarca',
      direccion: 'Calle 1 # 2-3',
    },
    ...overrides,
  };
}

describeDb('PrismaOrderRepository', () => {
  let prisma: PrismaService;
  let host: PrismaTransactionHost;
  let repo: PrismaOrderRepository;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    host = new PrismaTransactionHost(prisma);
    repo = new PrismaOrderRepository(host);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({
      where: { orderNumber: { startsWith: 'C3L-TEST-' } },
    });
    await prisma.$disconnect();
  });

  it('dos transiciones concurrentes desde PENDIENTE: solo una aplica', async () => {
    const order = await repo.create(nuevoPedido());
    const transicion = (statusNuevo: EstadoPedido) =>
      host.run(() =>
        repo.transitionStatus({
          orderId: order.id,
          statusAnterior: EstadoPedido.PENDIENTE,
          statusNuevo,
          changedBy: 'int-spec',
        }),
      );

    const resultados = await Promise.all([
      transicion(EstadoPedido.CONFIRMADO),
      transicion(EstadoPedido.CANCELADO),
    ]);

    expect(resultados.filter((r) => r === null)).toHaveLength(1);
    const ganador = resultados.find((r) => r !== null)!;
    const enBase = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(enBase.status).toBe(ganador.status);
    expect(
      await prisma.orderStatusHistory.count({
        where: { orderId: order.id, statusAnterior: EstadoPedido.PENDIENTE },
      }),
    ).toBe(1);
  });

  it('con estado anterior desactualizado devuelve null y no escribe historial', async () => {
    const pedido = await repo.create(nuevoPedido());

    const r = await host.run(() =>
      repo.transitionStatus({
        orderId: pedido.id,
        statusAnterior: EstadoPedido.CONFIRMADO,
        statusNuevo: EstadoPedido.EN_CAMINO,
        changedBy: 'int-spec',
      }),
    );

    expect(r).toBeNull();
    expect(
      await prisma.orderStatusHistory.count({ where: { orderId: pedido.id } }),
    ).toBe(1);
  });
});
