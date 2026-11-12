import { Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import {
  BusinessRuleViolation,
  UnauthorizedError,
} from '../../../../shared/domain/domain-error';
import type { UnitOfWorkPort } from '../../../../shared/application/ports/unit-of-work.port';
import { fakeEventBus } from '../../../../shared/testing/fakes';
import {
  PagoAprobado,
  PagoDuplicado,
  PagoReembolsado,
  PagoSinPedido,
} from '../../domain/payment-events';
import { EstadoPago, reglaDeTransicion } from '../../domain/payment-status';
import { HandleWebhookUseCase } from './handle-webhook.use-case';

const WEBHOOK_SECRET = 'test-secret';

function firmarWebhook(
  dataId: string,
  requestId: string,
  ts = String(Date.now()),
) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');
  return `ts=${ts},v1=${v1}`;
}

function webhookDto(id = 'mp-1') {
  return { type: 'payment', data: { id } };
}

const ORDER_NUMBER = 'C3L-20260101-ABCDE';

function makeUseCase({ sinSecreto = false } = {}) {
  const secret = sinSecreto ? undefined : WEBHOOK_SECRET;
  const tx = { enTransaccion: false };

  const transicionarEnTx: boolean[] = [];
  const crearEnTx: boolean[] = [];
  const linkEnTx: boolean[] = [];
  const publishEnTx: boolean[] = [];

  const orders = {
    cotizar: jest.fn(),
    nuevoNumeroDePedido: jest.fn(),
    findForPayment: jest.fn(),
    confirmarPorPago: jest.fn().mockResolvedValue(undefined),
    crearConfirmadoPorPago: jest.fn(),
  };
  const gateway = {
    createPreference: jest.fn(),
    getPayment: jest.fn().mockResolvedValue({
      status: 'approved',
      externalReference: ORDER_NUMBER,
      transactionAmount: 50000,
      currencyId: 'COP',
    }),
  };
  const payments = {
    create: jest.fn(),
    findMostRecentByOrderId: jest.fn(),
    findMostRecentByOrderNumber: jest.fn(),
    findById: jest.fn(),
    transicionar: jest.fn().mockResolvedValue(true),
    linkToOrder: jest.fn().mockResolvedValue(undefined),
  };
  const settings = {
    webhookSecret: jest.fn(() => {
      if (secret === undefined) throw new Error('Falta MP_WEBHOOK_SECRET');
      return secret;
    }),
  };
  const uow = {
    run: jest.fn(async (work: () => Promise<unknown>) => {
      const previo = tx.enTransaccion;
      tx.enTransaccion = true;
      try {
        return await work();
      } finally {
        tx.enTransaccion = previo;
      }
    }),
  };
  const events = fakeEventBus();

  // uow.run marca enTransaccion mientras corre work. Se envuelven los mocks
  // para registrar enTransaccion en cada llamada sin perder su configuración
  // por test (mockResolvedValue, mockRejectedValue, ...).
  const registrar = (
    fn: jest.Mock,
    destino: boolean[],
  ): ((...args: unknown[]) => unknown) => {
    return (...args: unknown[]) => {
      destino.push(tx.enTransaccion);
      return fn(...args) as unknown;
    };
  };

  const useCase = new HandleWebhookUseCase(
    {
      ...orders,
      crearConfirmadoPorPago: registrar(
        orders.crearConfirmadoPorPago,
        crearEnTx,
      ),
    } as never,
    gateway,
    {
      ...payments,
      transicionar: registrar(payments.transicionar, transicionarEnTx),
      linkToOrder: registrar(payments.linkToOrder, linkEnTx),
    } as never,
    settings,
    uow as typeof uow & UnitOfWorkPort,
    {
      ...events,
      publish: registrar(events.publish, publishEnTx),
    } as never,
  );

  return {
    useCase,
    orders,
    gateway,
    payments,
    events,
    uow,
    tx,
    enTx: {
      transicionar: transicionarEnTx,
      crear: crearEnTx,
      link: linkEnTx,
      publish: publishEnTx,
    },
  };
}

type Ctx = ReturnType<typeof makeUseCase>;

const shippingInfo = {
  email: 'cliente@test.com',
  nombreCompleto: 'Cliente Test',
  telefono: '3000000000',
  ciudad: 'Bogota',
  departamento: 'Bogota',
  direccion: 'Calle 1',
};

const existingPayment = {
  id: 'payment-1',
  orderId: null as string | null,
  orderNumber: ORDER_NUMBER,
  total: 50000,
  estado: 'PENDIENTE',
  mpPaymentId: null as string | null,
  draftPayload: {
    itemsData: [
      {
        productId: 'prod-1',
        nombre: 'Reloj',
        precioUnitario: 50000,
        cantidad: 1,
        subtotal: 50000,
      },
    ],
    subtotal: 50000,
    total: 50000,
    shippingInfo,
    userId: null,
    fbp: 'fb.p.1',
    fbc: 'fb.c.1',
  } as unknown,
};

const pedidoCreado = {
  id: 'order-9',
  orderNumber: ORDER_NUMBER,
  pendiente: false,
  total: 50000,
  fbp: 'fb.p.1',
  fbc: 'fb.c.1',
  shippingInfo: {
    email: 'cliente@test.com',
    nombreCompleto: 'Cliente Test',
    telefono: '3000000000',
    ciudad: 'Bogota',
    departamento: 'Bogota',
  },
  items: (existingPayment.draftPayload as { itemsData: unknown[] }).itemsData,
};

const paymentConOrder = {
  ...existingPayment,
  orderId: 'order-5',
  total: 80000,
  draftPayload: null,
};
const ordenExistente = {
  ...pedidoCreado,
  id: 'order-5',
  pendiente: true,
  total: 80000,
};

function cobro(ctx: Ctx, extra: Record<string, unknown> = {}) {
  ctx.gateway.getPayment.mockResolvedValue({
    status: 'approved',
    externalReference: ORDER_NUMBER,
    transactionAmount: 50000,
    currencyId: 'COP',
    ...extra,
  });
}

function aprobado(ctx: Ctx, payment: object | null = existingPayment) {
  ctx.payments.findMostRecentByOrderNumber.mockResolvedValue(payment);
  ctx.orders.crearConfirmadoPorPago.mockResolvedValue(pedidoCreado);
}

const ejecutar = (ctx: Ctx) =>
  ctx.useCase.execute(
    webhookDto('mp-1'),
    firmarWebhook('mp-1', 'req-1'),
    'req-1',
  );

function sinPagoAprobado(ctx: Ctx) {
  expect(ctx.events.of(PagoAprobado)).toHaveLength(0);
}

describe('HandleWebhookUseCase', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('firma y errores', () => {
    it('ignora notificaciones que no son de tipo payment', async () => {
      const { useCase, gateway } = makeUseCase();

      await expect(
        useCase.execute(
          { type: 'merchant_order', data: { id: '1' } },
          'x',
          'y',
        ),
      ).resolves.toBeUndefined();

      expect(gateway.getPayment).not.toHaveBeenCalled();
    });

    it('rechaza con UnauthorizedError si faltan los headers de firma', async () => {
      const { useCase, gateway } = makeUseCase();

      await expect(
        useCase.execute(webhookDto(), undefined, undefined),
      ).rejects.toBeInstanceOf(UnauthorizedError);

      expect(gateway.getPayment).not.toHaveBeenCalled();
    });

    it('rechaza con UnauthorizedError si la firma no coincide', async () => {
      const { useCase, gateway } = makeUseCase();

      await expect(
        useCase.execute(
          webhookDto('mp-1'),
          'ts=123,v1=firma-invalida',
          'req-1',
        ),
      ).rejects.toBeInstanceOf(UnauthorizedError);

      expect(gateway.getPayment).not.toHaveBeenCalled();
    });

    it('rechaza con UnauthorizedError si la firma es de hace mas de 5 minutos', async () => {
      const { useCase, gateway } = makeUseCase();

      await expect(
        useCase.execute(
          webhookDto('mp-1'),
          firmarWebhook('mp-1', 'req-1', String(Date.now() - 6 * 60_000)),
          'req-1',
        ),
      ).rejects.toBeInstanceOf(UnauthorizedError);

      expect(gateway.getPayment).not.toHaveBeenCalled();
    });

    it('si falta MP_WEBHOOK_SECRET propaga el error (500, MercadoPago reintenta), no 401', async () => {
      const ctx = makeUseCase({ sinSecreto: true });

      const error = await ejecutar(ctx).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(UnauthorizedError);
      expect(ctx.gateway.getPayment).not.toHaveBeenCalled();
    });

    it('propaga el error si MercadoPago no responde', async () => {
      const ctx = makeUseCase();
      ctx.gateway.getPayment.mockRejectedValue(
        new Error('timeout MercadoPago'),
      );

      await expect(ejecutar(ctx)).rejects.toThrow('timeout MercadoPago');

      expect(ctx.events.publish).not.toHaveBeenCalled();
    });

    it('propaga un error inesperado al crear el pedido, sin alerta ni segunda transicion', async () => {
      const ctx = makeUseCase();
      aprobado(ctx);
      ctx.orders.crearConfirmadoPorPago.mockRejectedValue(
        new Error('DB caida'),
      );

      await expect(ejecutar(ctx)).rejects.toThrow('DB caida');

      expect(ctx.payments.transicionar).toHaveBeenCalledTimes(1);
      expect(ctx.events.publish).not.toHaveBeenCalled();
    });
  });

  describe('approved feliz, todo dentro de una transaccion', () => {
    it('flujo nuevo: transicion, pedido, enlace y PagoAprobado ocurren en una sola uow.run', async () => {
      const ctx = makeUseCase();
      aprobado(ctx);

      await ejecutar(ctx);

      expect(ctx.uow.run).toHaveBeenCalledTimes(1);
      expect(ctx.uow.run).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 15000,
      });
      expect(ctx.payments.transicionar).toHaveBeenCalledWith({
        paymentId: 'payment-1',
        nuevoEstado: 'APROBADO',
        mpPaymentId: 'mp-1',
        regla: reglaDeTransicion('APROBADO'),
      });
      expect(ctx.orders.crearConfirmadoPorPago).toHaveBeenCalledWith({
        orderNumber: ORDER_NUMBER,
        itemsData: pedidoCreado.items,
        subtotal: 50000,
        total: 50000,
        shippingInfo,
        userId: null,
        fbp: 'fb.p.1',
        fbc: 'fb.c.1',
      });
      expect(ctx.payments.linkToOrder).toHaveBeenCalledWith(
        'payment-1',
        'order-9',
      );
      expect(ctx.enTx.transicionar).toEqual([true]);
      expect(ctx.enTx.crear).toEqual([true]);
      expect(ctx.enTx.link).toEqual([true]);
      expect(ctx.enTx.publish).toEqual([true]);
      expect(ctx.tx.enTransaccion).toBe(false);
    });

    it('publica PagoAprobado con las lineas, el cliente y las cookies, sin comprobantePdf', async () => {
      const ctx = makeUseCase();
      aprobado(ctx);

      await ejecutar(ctx);

      expect(ctx.events.of(PagoAprobado)[0].pago).toEqual({
        orderNumber: ORDER_NUMBER,
        total: 50000,
        lineas: pedidoCreado.items,
        cliente: pedidoCreado.shippingInfo,
        fbp: 'fb.p.1',
        fbc: 'fb.c.1',
      });
    });

    it('PagoAprobado sin cliente si el pedido no tiene shippingInfo', async () => {
      const ctx = makeUseCase();
      aprobado(ctx);
      ctx.orders.crearConfirmadoPorPago.mockResolvedValue({
        ...pedidoCreado,
        fbp: null,
        fbc: null,
        shippingInfo: null,
      });

      await ejecutar(ctx);

      expect(ctx.events.of(PagoAprobado)[0].pago.cliente).toBeNull();
    });

    it('flujo viejo: confirma el pedido PENDIENTE y publica PagoAprobado', async () => {
      const ctx = makeUseCase();
      cobro(ctx, { transactionAmount: 80000 });
      aprobado(ctx, paymentConOrder);
      ctx.orders.findForPayment.mockResolvedValue(ordenExistente);

      await ejecutar(ctx);

      expect(ctx.orders.confirmarPorPago).toHaveBeenCalledWith('order-5');
      expect(ctx.orders.crearConfirmadoPorPago).not.toHaveBeenCalled();
      expect(ctx.events.of(PagoAprobado)[0].pago.total).toBe(80000);
    });

    it('un approved sobre una fila RECHAZADO (primer intento rechazado) crea el pedido', async () => {
      const ctx = makeUseCase();
      aprobado(ctx, {
        ...existingPayment,
        estado: 'RECHAZADO',
        mpPaymentId: 'mp-0',
      });

      await ejecutar(ctx);

      expect(ctx.orders.crearConfirmadoPorPago).toHaveBeenCalled();
      expect(ctx.events.of(PagoAprobado)).toHaveLength(1);
    });
  });

  describe('cada camino de approved sin pedido termina en alerta', () => {
    it('sin external_reference → PagoSinPedido SIN-REFERENCIA', async () => {
      const ctx = makeUseCase();
      cobro(ctx, { externalReference: null });

      await ejecutar(ctx);

      expect(ctx.events.of(PagoSinPedido)[0].incidente).toEqual({
        orderNumber: 'SIN-REFERENCIA',
        mpPaymentId: 'mp-1',
        detalle: 'MercadoPago aprobó un pago sin external_reference',
      });
      expect(ctx.payments.findMostRecentByOrderNumber).not.toHaveBeenCalled();
      sinPagoAprobado(ctx);
    });

    it('sin registro de Payment → PagoSinPedido', async () => {
      const ctx = makeUseCase();
      aprobado(ctx, null);

      await ejecutar(ctx);

      expect(ctx.events.of(PagoSinPedido)[0].incidente).toEqual({
        orderNumber: ORDER_NUMBER,
        mpPaymentId: 'mp-1',
        detalle: 'No hay registro de pago para este número de pedido',
      });
      expect(ctx.payments.transicionar).not.toHaveBeenCalled();
      sinPagoAprobado(ctx);
    });

    it('monto distinto → PagoSinPedido, sin pedido, y el pago queda APROBADO', async () => {
      const ctx = makeUseCase();
      cobro(ctx, { transactionAmount: 49000 });
      aprobado(ctx);

      await expect(ejecutar(ctx)).resolves.toBeUndefined();

      expect(ctx.events.of(PagoSinPedido)[0].incidente).toEqual({
        orderNumber: ORDER_NUMBER,
        mpPaymentId: 'mp-1',
        detalle: 'Monto cobrado 49000 distinto del total esperado 50000',
      });
      expect(ctx.orders.crearConfirmadoPorPago).not.toHaveBeenCalled();
      expect(ctx.payments.transicionar).toHaveBeenCalledTimes(2);
      expect(ctx.payments.transicionar).toHaveBeenLastCalledWith({
        paymentId: 'payment-1',
        nuevoEstado: EstadoPago.APROBADO,
        mpPaymentId: 'mp-1',
        regla: reglaDeTransicion(EstadoPago.APROBADO),
      });
      expect(ctx.enTx.transicionar).toEqual([true, true]);
      expect(ctx.uow.run).toHaveBeenCalledTimes(2);
      sinPagoAprobado(ctx);
    });

    it('moneda distinta → PagoSinPedido', async () => {
      const ctx = makeUseCase();
      cobro(ctx, { currencyId: 'USD' });
      aprobado(ctx);

      await ejecutar(ctx);

      expect(ctx.events.of(PagoSinPedido)[0].incidente.detalle).toBe(
        'Moneda cobrada USD distinta de COP',
      );
      sinPagoAprobado(ctx);
    });

    it('flujo nuevo sin draftPayload → PagoSinPedido', async () => {
      const ctx = makeUseCase();
      aprobado(ctx, { ...existingPayment, draftPayload: null });

      await ejecutar(ctx);

      expect(ctx.events.of(PagoSinPedido)[0].incidente.detalle).toBe(
        'El pago no tiene draftPayload: no se puede crear el pedido',
      );
      expect(ctx.orders.crearConfirmadoPorPago).not.toHaveBeenCalled();
      sinPagoAprobado(ctx);
    });

    it('flujo nuevo sin stock → PagoSinPedido y no lanza', async () => {
      const ctx = makeUseCase();
      aprobado(ctx);
      ctx.orders.crearConfirmadoPorPago.mockRejectedValue(
        new BusinessRuleViolation('Stock insuficiente'),
      );

      await expect(ejecutar(ctx)).resolves.toBeUndefined();

      expect(ctx.events.of(PagoSinPedido)[0].incidente).toEqual({
        orderNumber: ORDER_NUMBER,
        mpPaymentId: 'mp-1',
        detalle: 'Stock insuficiente',
      });
      expect(ctx.payments.linkToOrder).not.toHaveBeenCalled();
      sinPagoAprobado(ctx);
    });

    it('flujo viejo, pedido ya no PENDIENTE → PagoSinPedido', async () => {
      const ctx = makeUseCase();
      cobro(ctx, { transactionAmount: 80000 });
      aprobado(ctx, paymentConOrder);
      ctx.orders.findForPayment.mockResolvedValue({
        ...ordenExistente,
        pendiente: false,
      });

      await ejecutar(ctx);

      expect(ctx.events.of(PagoSinPedido)[0].incidente.detalle).toBe(
        'El pedido ya no está PENDIENTE: lo cambió otra operación',
      );
      expect(ctx.orders.confirmarPorPago).not.toHaveBeenCalled();
      sinPagoAprobado(ctx);
    });

    it('flujo viejo, pedido inexistente → PagoSinPedido', async () => {
      const ctx = makeUseCase();
      cobro(ctx, { transactionAmount: 80000 });
      aprobado(ctx, paymentConOrder);
      ctx.orders.findForPayment.mockResolvedValue(null);

      await ejecutar(ctx);

      expect(ctx.events.of(PagoSinPedido)[0].incidente.detalle).toBe(
        'El pedido ya no existe',
      );
      sinPagoAprobado(ctx);
    });

    it('flujo viejo, confirmar falla por regla de negocio → PagoSinPedido', async () => {
      const ctx = makeUseCase();
      cobro(ctx, { transactionAmount: 80000 });
      aprobado(ctx, paymentConOrder);
      ctx.orders.findForPayment.mockResolvedValue(ordenExistente);
      ctx.orders.confirmarPorPago.mockRejectedValue(
        new BusinessRuleViolation('Stock insuficiente'),
      );

      await expect(ejecutar(ctx)).resolves.toBeUndefined();

      expect(ctx.events.of(PagoSinPedido)[0].incidente).toEqual({
        orderNumber: ORDER_NUMBER,
        mpPaymentId: 'mp-1',
        detalle: 'Stock insuficiente',
      });
      sinPagoAprobado(ctx);
    });

    it('misma entrega repetida (fila APROBADO con el mismo mpPaymentId) no repite pedido ni alerta', async () => {
      const ctx = makeUseCase();
      aprobado(ctx);
      ctx.payments.transicionar.mockResolvedValue(false);
      ctx.payments.findById.mockResolvedValue({
        ...existingPayment,
        estado: 'APROBADO',
        mpPaymentId: 'mp-1',
      });

      await expect(ejecutar(ctx)).resolves.toBeUndefined();

      expect(ctx.payments.findById).toHaveBeenCalledWith('payment-1');
      expect(ctx.events.publish).not.toHaveBeenCalled();
      expect(ctx.orders.crearConfirmadoPorPago).not.toHaveBeenCalled();
    });

    it('doble cobro: fila APROBADO con otro mpPaymentId → PagoDuplicado', async () => {
      const ctx = makeUseCase();
      aprobado(ctx);
      ctx.payments.transicionar.mockResolvedValue(false);
      ctx.payments.findById.mockResolvedValue({
        ...existingPayment,
        estado: 'APROBADO',
        mpPaymentId: 'mp-0',
      });

      await ejecutar(ctx);

      expect(ctx.events.of(PagoDuplicado)[0].cobro).toEqual({
        orderNumber: ORDER_NUMBER,
        mpPaymentId: 'mp-1',
        mpPaymentIdAnterior: 'mp-0',
      });
      expect(ctx.orders.crearConfirmadoPorPago).not.toHaveBeenCalled();
      sinPagoAprobado(ctx);
    });

    it('approved de otro pago sobre una fila REEMBOLSADO → PagoDuplicado', async () => {
      const ctx = makeUseCase();
      aprobado(ctx);
      ctx.payments.transicionar.mockResolvedValue(false);
      ctx.payments.findById.mockResolvedValue({
        ...existingPayment,
        estado: 'REEMBOLSADO',
        mpPaymentId: 'mp-0',
      });

      await ejecutar(ctx);

      expect(ctx.events.of(PagoDuplicado)[0].cobro).toEqual({
        orderNumber: ORDER_NUMBER,
        mpPaymentId: 'mp-1',
        mpPaymentIdAnterior: 'mp-0',
      });
      sinPagoAprobado(ctx);
    });

    it('si tras un fallo de negocio otra entrega ya marco el pago, resuelve como ya procesado', async () => {
      const ctx = makeUseCase();
      aprobado(ctx);
      ctx.orders.crearConfirmadoPorPago.mockRejectedValue(
        new BusinessRuleViolation('Stock insuficiente'),
      );
      ctx.payments.transicionar
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      ctx.payments.findById.mockResolvedValue({
        ...existingPayment,
        estado: 'APROBADO',
        mpPaymentId: 'mp-1',
      });

      await expect(ejecutar(ctx)).resolves.toBeUndefined();

      expect(ctx.events.of(PagoSinPedido)).toHaveLength(0);
      expect(ctx.events.publish).not.toHaveBeenCalled();
    });

    it('estado inconsistente al resolver: lanza para reintentar', async () => {
      const ctx = makeUseCase();
      aprobado(ctx);
      ctx.payments.transicionar.mockResolvedValue(false);
      ctx.payments.findById.mockResolvedValue(null);

      await expect(ejecutar(ctx)).rejects.toThrow(
        'Estado de pago inconsistente al procesar el webhook',
      );
    });
  });

  describe('rechazos y reembolsos', () => {
    it('un rechazo no cancela el pedido del flujo viejo, solo transiciona el pago', async () => {
      const ctx = makeUseCase();
      cobro(ctx, { status: 'rejected' });
      aprobado(ctx, { ...existingPayment, orderId: 'order-5' });

      await ejecutar(ctx);

      expect(ctx.payments.transicionar).toHaveBeenCalledWith({
        paymentId: 'payment-1',
        nuevoEstado: EstadoPago.RECHAZADO,
        mpPaymentId: 'mp-1',
        regla: reglaDeTransicion('RECHAZADO'),
      });
      expect(ctx.orders.findForPayment).not.toHaveBeenCalled();
      expect(ctx.orders.confirmarPorPago).not.toHaveBeenCalled();
      expect(ctx.events.publish).not.toHaveBeenCalled();
    });

    it('pending solo transiciona', async () => {
      const ctx = makeUseCase();
      cobro(ctx, { status: 'pending' });
      aprobado(ctx);

      await ejecutar(ctx);

      expect(ctx.payments.transicionar).toHaveBeenCalledWith({
        paymentId: 'payment-1',
        nuevoEstado: EstadoPago.PENDIENTE,
        mpPaymentId: 'mp-1',
        regla: reglaDeTransicion(EstadoPago.PENDIENTE),
      });
      expect(ctx.orders.crearConfirmadoPorPago).not.toHaveBeenCalled();
      expect(ctx.orders.confirmarPorPago).not.toHaveBeenCalled();
      expect(ctx.events.publish).not.toHaveBeenCalled();
    });

    it('refunded sobre APROBADO → REEMBOLSADO y PagoReembolsado', async () => {
      const ctx = makeUseCase();
      cobro(ctx, { status: 'refunded' });
      aprobado(ctx, {
        ...existingPayment,
        orderId: 'order-9',
        estado: 'APROBADO',
        mpPaymentId: 'mp-1',
      });

      await ejecutar(ctx);

      expect(ctx.payments.transicionar).toHaveBeenCalledWith({
        paymentId: 'payment-1',
        nuevoEstado: EstadoPago.REEMBOLSADO,
        mpPaymentId: 'mp-1',
        regla: reglaDeTransicion('REEMBOLSADO'),
      });
      expect(ctx.enTx.transicionar).toEqual([true]);
      expect(ctx.uow.run).toHaveBeenCalledTimes(1);
      expect(ctx.events.of(PagoReembolsado)[0].reembolso).toEqual({
        orderNumber: ORDER_NUMBER,
        mpPaymentId: 'mp-1',
        estadoMp: 'refunded',
      });
      expect(ctx.orders.findForPayment).not.toHaveBeenCalled();
      expect(ctx.orders.confirmarPorPago).not.toHaveBeenCalled();
    });

    it('charged_back → PagoReembolsado con estadoMp charged_back', async () => {
      const ctx = makeUseCase();
      cobro(ctx, { status: 'charged_back' });
      aprobado(ctx, {
        ...existingPayment,
        estado: 'APROBADO',
        mpPaymentId: 'mp-1',
      });

      await ejecutar(ctx);

      expect(ctx.events.of(PagoReembolsado)[0].reembolso.estadoMp).toBe(
        'charged_back',
      );
    });

    it('refunded de otro pago (el duplicado) no alerta reembolso del pedido', async () => {
      const ctx = makeUseCase();
      cobro(ctx, { status: 'refunded' });
      aprobado(ctx, {
        ...existingPayment,
        estado: 'APROBADO',
        mpPaymentId: 'mp-0',
      });
      ctx.payments.transicionar.mockResolvedValue(false);

      await expect(ejecutar(ctx)).resolves.toBeUndefined();

      expect(ctx.events.publish).not.toHaveBeenCalled();
    });
  });
});
