import {
  ConflictError,
  TooManyRequestsError,
} from '../../../../shared/domain/domain-error';
import { fakeEventBus } from '../../../../shared/testing/fakes';
import { PedidoCreado } from '../../domain/order-events';
import { EstadoPedido, MetodoPago } from '../../domain/order-status';
import type { CreatedOrder } from '../ports/order-repository.port';
import { CreateOrderUseCase } from './create-order.use-case';

const KEY = '7b0f2c1e-3d4a-4b5c-9d6e-1f2a3b4c5d6e';

const cmd = {
  metodoPago: MetodoPago.CONTRAENTREGA,
  items: [{ productId: 'p', cantidad: 1 }],
  shippingInfo: {
    nombreCompleto: 'Ana',
    email: 'cliente@test.com',
    telefono: '300',
    ciudad: 'Bogotá',
    departamento: 'Cundinamarca',
    direccion: 'Calle 1',
  },
};

const item = {
  productId: 'p',
  nombre: 'Producto',
  precioUnitario: 1000,
  cantidad: 1,
  subtotal: 1000,
};

function pedido(id: string, email: string): CreatedOrder {
  const createdAt = new Date('2026-11-10T12:00:00Z');
  return {
    id,
    orderNumber: `N-${id}`,
    userId: null,
    status: EstadoPedido.PENDIENTE,
    subtotal: 1000,
    total: 1000,
    paymentMethod: MetodoPago.CONTRAENTREGA,
    fbp: null,
    fbc: null,
    createdAt,
    updatedAt: createdAt,
    items: [{ ...item, id: `i-${id}`, orderId: id }],
    shippingInfo: {
      ...cmd.shippingInfo,
      email,
      notas: null,
      id: `s-${id}`,
      orderId: id,
    },
    statusHistory: [
      {
        id: `h-${id}`,
        orderId: id,
        statusAnterior: null,
        statusNuevo: EstadoPedido.PENDIENTE,
        changedBy: null,
        createdAt,
      },
    ],
  };
}

const pedidoExistente = pedido('o-existente', 'cliente@test.com');
const pedidoNuevo = pedido('o-nuevo', 'cliente@test.com');

function setup(recientes = 0) {
  const orders = {
    countByShippingEmailSince: jest.fn().mockResolvedValue(recientes),
    findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ order: pedidoNuevo, nuevo: true }),
  };
  const resolveOrderItems = {
    execute: jest
      .fn()
      .mockResolvedValue({ itemsData: [item], subtotal: 1000, total: 1000 }),
  };
  const events = fakeEventBus();
  const useCase = new CreateOrderUseCase(
    orders as any,
    resolveOrderItems as any,
    events,
  );
  return { useCase, orders, resolveOrderItems, events };
}

describe('CreateOrderUseCase - límite por correo', () => {
  it('el sexto pedido del mismo email en una hora → TooManyRequestsError y no crea', async () => {
    const { useCase, orders, resolveOrderItems } = setup(5);
    await expect(useCase.execute(cmd)).rejects.toBeInstanceOf(
      TooManyRequestsError,
    );
    expect(orders.create).not.toHaveBeenCalled();
    expect(resolveOrderItems.execute).not.toHaveBeenCalled();
    const [email, desde] = orders.countByShippingEmailSince.mock.calls[0];
    expect(email).toBe('cliente@test.com');
    expect(Date.now() - desde.getTime()).toBeGreaterThanOrEqual(
      3_600_000 - 1000,
    );
  });

  it('con 4 pedidos recientes crea el pedido', async () => {
    const { useCase, orders } = setup(4);
    await useCase.execute(cmd);
    expect(orders.create).toHaveBeenCalled();
  });
});

describe('CreateOrderUseCase - idempotencyKey', () => {
  let orders: ReturnType<typeof setup>['orders'];
  let resolveOrderItems: ReturnType<typeof setup>['resolveOrderItems'];
  let events: ReturnType<typeof setup>['events'];
  let useCase: CreateOrderUseCase;

  beforeEach(() => {
    ({ useCase, orders, resolveOrderItems, events } = setup());
  });

  it('con una clave ya usada devuelve el pedido existente sin crear ni publicar', async () => {
    orders.findByIdempotencyKey.mockResolvedValue(pedidoExistente); // shippingInfo.email 'cliente@test.com'
    const r = await useCase.execute({ ...cmd, idempotencyKey: KEY });
    expect(r).toBe(pedidoExistente);
    expect(orders.findByIdempotencyKey).toHaveBeenCalledWith(KEY);
    expect(resolveOrderItems.execute).not.toHaveBeenCalled();
    expect(orders.create).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('la clave repetida no cuenta para el límite de pedidos por email', async () => {
    orders.countByShippingEmailSince.mockResolvedValue(5);
    orders.findByIdempotencyKey.mockResolvedValue(pedidoExistente);
    await expect(
      useCase.execute({ ...cmd, idempotencyKey: KEY }),
    ).resolves.toBe(pedidoExistente);
    expect(orders.countByShippingEmailSince).not.toHaveBeenCalled();
  });

  it('acepta la clave con el mismo email en otras mayúsculas o con espacios', async () => {
    orders.findByIdempotencyKey.mockResolvedValue(pedidoExistente);
    await expect(
      useCase.execute({
        ...cmd,
        shippingInfo: { ...cmd.shippingInfo, email: ' Cliente@Test.com ' },
        idempotencyKey: KEY,
      }),
    ).resolves.toBe(pedidoExistente);
  });

  it('rechaza la clave si el pedido existente es de otro email', async () => {
    orders.findByIdempotencyKey.mockResolvedValue(pedidoExistente);
    await expect(
      useCase.execute({
        ...cmd,
        shippingInfo: { ...cmd.shippingInfo, email: 'otro@test.com' },
        idempotencyKey: KEY,
      }),
    ).rejects.toThrow(ConflictError);
    expect(orders.create).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('no publica PedidoCreado si el repositorio devuelve nuevo=false (carrera)', async () => {
    orders.findByIdempotencyKey.mockResolvedValue(null);
    orders.create.mockResolvedValue({ order: pedidoExistente, nuevo: false });
    expect(await useCase.execute({ ...cmd, idempotencyKey: KEY })).toBe(
      pedidoExistente,
    );
    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: KEY }),
    );
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('en la carrera también rechaza si el pedido ganador es de otro email', async () => {
    orders.create.mockResolvedValue({
      order: pedido('o-otro', 'otro@test.com'),
      nuevo: false,
    });
    await expect(
      useCase.execute({ ...cmd, idempotencyKey: KEY }),
    ).rejects.toThrow(ConflictError);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('sin clave crea y publica como siempre', async () => {
    orders.create.mockResolvedValue({ order: pedidoNuevo, nuevo: true });
    const r = await useCase.execute(cmd);
    expect(r).toBe(pedidoNuevo);
    expect(orders.findByIdempotencyKey).not.toHaveBeenCalled();
    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: null }),
    );
    expect(events.of(PedidoCreado)).toHaveLength(1);
  });
});
