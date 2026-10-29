import { Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { BusinessRuleViolation } from '../../../../shared/domain/domain-error';
import { fakeEventBus } from '../../../../shared/testing/fakes';
import { PagoAprobado, PagoSinPedido } from '../../domain/payment-events';
import { EstadoPago } from '../../domain/payment-status';
import { HandleWebhookUseCase } from './handle-webhook.use-case';

const WEBHOOK_SECRET = 'test-secret';

function firmarWebhook(dataId: string, requestId: string, ts = '1700000000') {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');
  return `ts=${ts},v1=${v1}`;
}

function webhookDto(id = 'mp-1') {
  return { type: 'payment', data: { id } };
}

function makeUseCase({ sinSecreto = false } = {}) {
  const secret = sinSecreto ? undefined : WEBHOOK_SECRET;
  const orders = {
    cotizar: jest.fn(),
    nuevoNumeroDePedido: jest.fn(),
    findForPayment: jest.fn(),
    confirmarPorPago: jest.fn().mockResolvedValue(undefined),
    cancelarPorPago: jest.fn().mockResolvedValue(undefined),
    crearConfirmadoPorPago: jest.fn(),
  };
  const gateway = { createPreference: jest.fn(), getPayment: jest.fn() };
  const payments = {
    create: jest.fn(),
    findMostRecentByOrderId: jest.fn(),
    findMostRecentByOrderNumber: jest.fn(),
    markProcessedIfNotTerminal: jest.fn().mockResolvedValue(true),
    linkToOrder: jest.fn().mockResolvedValue(undefined),
  };
  const voucher = { generate: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
  const settings = {
    webhookSecret: jest.fn(() => {
      if (secret === undefined) throw new Error('Falta MP_WEBHOOK_SECRET');
      return secret;
    }),
  };
  const events = fakeEventBus();

  const useCase = new HandleWebhookUseCase(
    orders,
    gateway,
    payments,
    voucher,
    settings,
    events,
  );

  return { useCase, orders, gateway, payments, voucher, events };
}

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
  orderId: null,
  orderNumber: 'C3L-20260101-ABCDE',
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
  },
};

const pedidoCreado = {
  id: 'order-9',
  orderNumber: existingPayment.orderNumber,
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
  items: existingPayment.draftPayload.itemsData,
};

describe('HandleWebhookUseCase', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function aprobado(ctx: ReturnType<typeof makeUseCase>, payment: object) {
    ctx.gateway.getPayment.mockResolvedValue({
      status: 'approved',
      externalReference: existingPayment.orderNumber,
    });
    ctx.payments.findMostRecentByOrderNumber.mockResolvedValue(payment);
  }

  const ejecutar = (ctx: ReturnType<typeof makeUseCase>) =>
    ctx.useCase.execute(
      webhookDto('mp-1'),
      firmarWebhook('mp-1', 'req-1'),
      'req-1',
    );

  it('ignora notificaciones que no son de tipo payment', async () => {
    const { useCase, payments, gateway } = makeUseCase();

    await useCase.execute(
      { type: 'merchant_order', data: { id: '1' } },
      'x',
      'y',
    );

    expect(payments.findMostRecentByOrderNumber).not.toHaveBeenCalled();
    expect(gateway.getPayment).not.toHaveBeenCalled();
  });

  it('rechaza el webhook si faltan los headers de firma', async () => {
    const { useCase, gateway } = makeUseCase();

    await useCase.execute(webhookDto(), undefined, undefined);

    expect(gateway.getPayment).not.toHaveBeenCalled();
  });

  it('rechaza el webhook si la firma no coincide', async () => {
    const { useCase, gateway } = makeUseCase();

    await useCase.execute(
      webhookDto('mp-1'),
      'ts=123,v1=firma-invalida',
      'req-1',
    );

    expect(gateway.getPayment).not.toHaveBeenCalled();
  });

  it('rechaza el webhook si no puede verificar la firma (falta MP_WEBHOOK_SECRET)', async () => {
    const ctx = makeUseCase({ sinSecreto: true });

    await ejecutar(ctx);

    expect(ctx.gateway.getPayment).not.toHaveBeenCalled();
  });

  it('ignora el pago si MercadoPago no manda external_reference', async () => {
    const ctx = makeUseCase();
    ctx.gateway.getPayment.mockResolvedValue({
      status: 'approved',
      externalReference: null,
    });

    await ejecutar(ctx);

    expect(ctx.payments.findMostRecentByOrderNumber).not.toHaveBeenCalled();
  });

  it('ignora el pago si no hay un registro de Payment para ese orderNumber', async () => {
    const ctx = makeUseCase();
    aprobado(ctx, null as never);

    await ejecutar(ctx);

    expect(ctx.payments.markProcessedIfNotTerminal).not.toHaveBeenCalled();
  });

  it('no reprocesa un webhook si otra entrega ya dejo el pago en estado terminal', async () => {
    const ctx = makeUseCase();
    aprobado(ctx, existingPayment);
    ctx.payments.markProcessedIfNotTerminal.mockResolvedValue(false);

    await ejecutar(ctx);

    expect(ctx.orders.crearConfirmadoPorPago).not.toHaveBeenCalled();
    expect(ctx.events.publish).not.toHaveBeenCalled();
  });

  it('un pago pending no dispara confirmacion ni cancelacion de pedido', async () => {
    const ctx = makeUseCase();
    ctx.gateway.getPayment.mockResolvedValue({
      status: 'pending',
      externalReference: existingPayment.orderNumber,
    });
    ctx.payments.findMostRecentByOrderNumber.mockResolvedValue(existingPayment);

    await ejecutar(ctx);

    expect(ctx.payments.markProcessedIfNotTerminal).toHaveBeenCalledWith({
      paymentId: 'payment-1',
      nuevoEstado: EstadoPago.PENDIENTE,
      mpPaymentId: 'mp-1',
    });
    expect(ctx.orders.crearConfirmadoPorPago).not.toHaveBeenCalled();
    expect(ctx.orders.confirmarPorPago).not.toHaveBeenCalled();
    expect(ctx.orders.cancelarPorPago).not.toHaveBeenCalled();
  });

  describe('pago aprobado, flujo nuevo (sin orderId)', () => {
    it('crea el pedido confirmado a partir del draftPayload y enlaza el pago', async () => {
      const ctx = makeUseCase();
      aprobado(ctx, existingPayment);
      ctx.orders.crearConfirmadoPorPago.mockResolvedValue(pedidoCreado);

      await ejecutar(ctx);

      expect(ctx.orders.crearConfirmadoPorPago).toHaveBeenCalledWith({
        orderNumber: existingPayment.orderNumber,
        itemsData: existingPayment.draftPayload.itemsData,
        subtotal: existingPayment.draftPayload.subtotal,
        total: existingPayment.draftPayload.total,
        shippingInfo,
        userId: null,
        fbp: 'fb.p.1',
        fbc: 'fb.c.1',
      });
      expect(ctx.payments.linkToOrder).toHaveBeenCalledWith(
        'payment-1',
        'order-9',
      );
    });

    it('publica PagoAprobado con el comprobante, los datos del cliente y las cookies del pedido', async () => {
      const ctx = makeUseCase();
      aprobado(ctx, existingPayment);
      ctx.orders.crearConfirmadoPorPago.mockResolvedValue(pedidoCreado);

      await ejecutar(ctx);

      expect(ctx.voucher.generate).toHaveBeenCalledWith(pedidoCreado);
      expect(ctx.events.of(PagoAprobado)[0].pago).toEqual({
        orderNumber: existingPayment.orderNumber,
        total: 50000,
        lineas: existingPayment.draftPayload.itemsData,
        cliente: pedidoCreado.shippingInfo,
        fbp: 'fb.p.1',
        fbc: 'fb.c.1',
        comprobantePdf: expect.any(Buffer),
      });
    });

    it('si falta el draftPayload, no crea el pedido ni publica nada', async () => {
      const ctx = makeUseCase();
      aprobado(ctx, { ...existingPayment, draftPayload: null });

      await ejecutar(ctx);

      expect(ctx.orders.crearConfirmadoPorPago).not.toHaveBeenCalled();
      expect(ctx.events.publish).not.toHaveBeenCalled();
    });

    it('si no hay stock para crear el pedido, publica PagoSinPedido y no lanza', async () => {
      const ctx = makeUseCase();
      aprobado(ctx, existingPayment);
      ctx.orders.crearConfirmadoPorPago.mockRejectedValue(
        new BusinessRuleViolation('Stock insuficiente'),
      );

      await expect(ejecutar(ctx)).resolves.toBeUndefined();

      expect(ctx.events.of(PagoSinPedido)[0].incidente).toEqual({
        orderNumber: existingPayment.orderNumber,
        detalle: 'Stock insuficiente',
      });
      expect(ctx.events.of(PagoAprobado)).toHaveLength(0);
      expect(ctx.payments.linkToOrder).not.toHaveBeenCalled();
    });

    it('si el pedido quedo sin shippingInfo, publica PagoAprobado sin cliente', async () => {
      const ctx = makeUseCase();
      aprobado(ctx, existingPayment);
      ctx.orders.crearConfirmadoPorPago.mockResolvedValue({
        ...pedidoCreado,
        fbp: null,
        fbc: null,
        shippingInfo: null,
      });

      await ejecutar(ctx);

      expect(ctx.events.of(PagoAprobado)[0].pago.cliente).toBeNull();
    });
  });

  describe('pago aprobado, flujo viejo (pedido ya existia PENDIENTE)', () => {
    const paymentConOrder = {
      ...existingPayment,
      orderId: 'order-5',
      draftPayload: null,
    };
    const ordenExistente = {
      ...pedidoCreado,
      id: 'order-5',
      pendiente: true,
      total: 80000,
    };

    it('confirma el pedido existente (sin email de estado: va el comprobante)', async () => {
      const ctx = makeUseCase();
      aprobado(ctx, paymentConOrder);
      ctx.orders.findForPayment.mockResolvedValue(ordenExistente);

      await ejecutar(ctx);

      expect(ctx.orders.confirmarPorPago).toHaveBeenCalledWith('order-5');
      expect(ctx.orders.crearConfirmadoPorPago).not.toHaveBeenCalled();
      expect(ctx.events.of(PagoAprobado)[0].pago.total).toBe(80000);
    });

    it('no hace nada si el pedido legado ya no esta PENDIENTE', async () => {
      const ctx = makeUseCase();
      aprobado(ctx, paymentConOrder);
      ctx.orders.findForPayment.mockResolvedValue({
        ...ordenExistente,
        pendiente: false,
      });

      await ejecutar(ctx);

      expect(ctx.orders.confirmarPorPago).not.toHaveBeenCalled();
      expect(ctx.events.publish).not.toHaveBeenCalled();
    });

    it('si no puede confirmar el pedido legado, publica PagoSinPedido y no el comprobante', async () => {
      const ctx = makeUseCase();
      aprobado(ctx, paymentConOrder);
      ctx.orders.findForPayment.mockResolvedValue(ordenExistente);
      ctx.orders.confirmarPorPago.mockRejectedValue(new Error('DB caida'));

      await expect(ejecutar(ctx)).resolves.toBeUndefined();

      expect(ctx.events.of(PagoSinPedido)[0].incidente).toEqual({
        orderNumber: existingPayment.orderNumber,
        detalle: 'DB caida',
      });
      expect(ctx.events.of(PagoAprobado)).toHaveLength(0);
    });
  });

  describe('pago rechazado o cancelado', () => {
    function rechazado(ctx: ReturnType<typeof makeUseCase>, payment: object) {
      ctx.gateway.getPayment.mockResolvedValue({
        status: 'rejected',
        externalReference: existingPayment.orderNumber,
      });
      ctx.payments.findMostRecentByOrderNumber.mockResolvedValue(payment);
    }

    it('cancela el pedido legado si estaba PENDIENTE', async () => {
      const ctx = makeUseCase();
      rechazado(ctx, { ...existingPayment, orderId: 'order-5' });
      ctx.orders.findForPayment.mockResolvedValue({
        id: 'order-5',
        pendiente: true,
      });

      await ejecutar(ctx);

      expect(ctx.orders.cancelarPorPago).toHaveBeenCalledWith('order-5');
    });

    it('no hace nada si el pago rechazado nunca tuvo un pedido asociado (flujo nuevo)', async () => {
      const ctx = makeUseCase();
      ctx.gateway.getPayment.mockResolvedValue({
        status: 'cancelled',
        externalReference: existingPayment.orderNumber,
      });
      ctx.payments.findMostRecentByOrderNumber.mockResolvedValue(
        existingPayment,
      );

      await ejecutar(ctx);

      expect(ctx.orders.cancelarPorPago).not.toHaveBeenCalled();
      expect(ctx.orders.findForPayment).not.toHaveBeenCalled();
    });

    it('no hace nada si el pedido legado del pago rechazado ya no existe', async () => {
      const ctx = makeUseCase();
      rechazado(ctx, { ...existingPayment, orderId: 'order-5' });
      ctx.orders.findForPayment.mockResolvedValue(null);

      await ejecutar(ctx);

      expect(ctx.orders.cancelarPorPago).not.toHaveBeenCalled();
    });
  });

  it('atrapa errores inesperados al consultar el pago en MercadoPago y no los propaga', async () => {
    const ctx = makeUseCase();
    ctx.gateway.getPayment.mockRejectedValue(new Error('timeout MercadoPago'));

    await expect(ejecutar(ctx)).resolves.toBeUndefined();
  });
});
