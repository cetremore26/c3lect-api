import { BadRequestException, Logger } from '@nestjs/common';
import { EstadoPago, EstadoPedido } from '@prisma/client';
import { createHmac } from 'crypto';
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
  return { type: 'payment', data: { id } } as any;
}

function makeUseCase(envs: Record<string, string | undefined> = {}) {
  const allEnvs = {
    MP_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ADMIN_EMAIL: undefined,
    ...envs,
  };

  const mail = {
    sendPaymentConfirmation: jest.fn().mockResolvedValue(undefined),
    sendStockAlert: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const value = allEnvs[key];
      if (value === undefined) throw new Error(`Falta config ${key}`);
      return value;
    }),
    get: jest.fn((key: string) => allEnvs[key]),
  };
  const ordersService = {
    createConfirmedOrder: jest.fn(),
    updateStatus: jest.fn().mockResolvedValue(undefined),
  };
  const metaConversions = {
    sendPurchase: jest.fn().mockResolvedValue(undefined),
  };
  const orderRepository = { findByIdForPayment: jest.fn() };
  const gateway = { getPayment: jest.fn() };
  const payments = {
    findMostRecentByOrderNumber: jest.fn(),
    markProcessedIfNotTerminal: jest.fn().mockResolvedValue(true),
    linkToOrder: jest.fn().mockResolvedValue(undefined),
  };
  const voucher = { generate: jest.fn().mockResolvedValue(Buffer.from('pdf')) };

  const useCase = new HandleWebhookUseCase(
    mail as any,
    config as any,
    ordersService as any,
    metaConversions as any,
    orderRepository as any,
    gateway as any,
    payments as any,
    voucher,
  );

  return {
    useCase,
    mail,
    config,
    ordersService,
    metaConversions,
    orderRepository,
    gateway,
    payments,
    voucher,
  };
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
    const { useCase, gateway } = makeUseCase({ MP_WEBHOOK_SECRET: undefined });
    const signature = firmarWebhook('mp-1', 'req-1');

    await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

    expect(gateway.getPayment).not.toHaveBeenCalled();
  });

  it('ignora el pago si MercadoPago no manda external_reference', async () => {
    const { useCase, gateway, payments } = makeUseCase();
    gateway.getPayment.mockResolvedValue({
      status: 'approved',
      externalReference: null,
    });
    const signature = firmarWebhook('mp-1', 'req-1');

    await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

    expect(payments.findMostRecentByOrderNumber).not.toHaveBeenCalled();
  });

  it('ignora el pago si no hay un registro de Payment para ese orderNumber', async () => {
    const { useCase, gateway, payments } = makeUseCase();
    gateway.getPayment.mockResolvedValue({
      status: 'approved',
      externalReference: 'C3L-nope',
    });
    payments.findMostRecentByOrderNumber.mockResolvedValue(null);
    const signature = firmarWebhook('mp-1', 'req-1');

    await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

    expect(payments.markProcessedIfNotTerminal).not.toHaveBeenCalled();
  });

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
      shippingInfo: {
        email: 'cliente@test.com',
        nombreCompleto: 'Cliente Test',
        telefono: '3000000000',
        ciudad: 'Bogota',
        departamento: 'Bogota',
      },
      userId: null,
      fbp: 'fb.p.1',
      fbc: 'fb.c.1',
    },
  };

  it('no reprocesa un webhook si otra entrega ya dejo el pago en estado terminal', async () => {
    const { useCase, gateway, payments, ordersService, mail } = makeUseCase();
    gateway.getPayment.mockResolvedValue({
      status: 'approved',
      externalReference: existingPayment.orderNumber,
    });
    payments.findMostRecentByOrderNumber.mockResolvedValue(existingPayment);
    payments.markProcessedIfNotTerminal.mockResolvedValue(false);
    const signature = firmarWebhook('mp-1', 'req-1');

    await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

    expect(ordersService.createConfirmedOrder).not.toHaveBeenCalled();
    expect(mail.sendPaymentConfirmation).not.toHaveBeenCalled();
  });

  it('un pago pending no dispara confirmacion ni cancelacion de pedido', async () => {
    const { useCase, gateway, payments, ordersService } = makeUseCase();
    gateway.getPayment.mockResolvedValue({
      status: 'pending',
      externalReference: existingPayment.orderNumber,
    });
    payments.findMostRecentByOrderNumber.mockResolvedValue(existingPayment);
    const signature = firmarWebhook('mp-1', 'req-1');

    await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

    expect(payments.markProcessedIfNotTerminal).toHaveBeenCalledWith({
      paymentId: 'payment-1',
      nuevoEstado: EstadoPago.PENDIENTE,
      mpPaymentId: 'mp-1',
    });
    expect(ordersService.createConfirmedOrder).not.toHaveBeenCalled();
    expect(ordersService.updateStatus).not.toHaveBeenCalled();
  });

  describe('pago aprobado, flujo nuevo (sin orderId)', () => {
    it('crea el pedido confirmado a partir del draftPayload y enlaza el pago', async () => {
      const { useCase, gateway, payments, ordersService, mail } = makeUseCase();
      gateway.getPayment.mockResolvedValue({
        status: 'approved',
        externalReference: existingPayment.orderNumber,
      });
      payments.findMostRecentByOrderNumber.mockResolvedValue(existingPayment);
      const ordenCreada = {
        id: 'order-9',
        orderNumber: existingPayment.orderNumber,
        total: 50000,
        fbp: 'fb.p.1',
        fbc: 'fb.c.1',
        shippingInfo: existingPayment.draftPayload.shippingInfo,
        items: existingPayment.draftPayload.itemsData,
      };
      ordersService.createConfirmedOrder.mockResolvedValue(ordenCreada);
      const signature = firmarWebhook('mp-1', 'req-1');

      await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

      expect(ordersService.createConfirmedOrder).toHaveBeenCalledWith({
        orderNumber: existingPayment.orderNumber,
        itemsData: existingPayment.draftPayload.itemsData,
        subtotal: existingPayment.draftPayload.subtotal,
        total: existingPayment.draftPayload.total,
        shippingInfo: existingPayment.draftPayload.shippingInfo,
        userId: null,
        fbp: 'fb.p.1',
        fbc: 'fb.c.1',
      });
      expect(payments.linkToOrder).toHaveBeenCalledWith('payment-1', 'order-9');
      expect(mail.sendPaymentConfirmation).toHaveBeenCalledWith(
        'cliente@test.com',
        'Cliente Test',
        existingPayment.orderNumber,
        50000,
        expect.any(Buffer),
      );
      expect(mail.sendPaymentConfirmation).toHaveBeenCalledTimes(1); // sin ADMIN_EMAIL configurado
    });

    it('tambien envia el comprobante al admin cuando ADMIN_EMAIL esta configurado', async () => {
      const { useCase, gateway, payments, ordersService, mail } = makeUseCase({
        ADMIN_EMAIL: 'admin@c3lect.com',
      });
      gateway.getPayment.mockResolvedValue({
        status: 'approved',
        externalReference: existingPayment.orderNumber,
      });
      payments.findMostRecentByOrderNumber.mockResolvedValue(existingPayment);
      ordersService.createConfirmedOrder.mockResolvedValue({
        id: 'order-9',
        orderNumber: existingPayment.orderNumber,
        total: 50000,
        fbp: 'fb.p.1',
        fbc: 'fb.c.1',
        shippingInfo: existingPayment.draftPayload.shippingInfo,
        items: existingPayment.draftPayload.itemsData,
      });
      const signature = firmarWebhook('mp-1', 'req-1');

      await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

      expect(mail.sendPaymentConfirmation).toHaveBeenCalledTimes(2);
      expect(mail.sendPaymentConfirmation).toHaveBeenCalledWith(
        'admin@c3lect.com',
        'Admin',
        existingPayment.orderNumber,
        50000,
        expect.any(Buffer),
      );
    });

    it('envia el Purchase a Conversions API con los datos del cliente y las cookies del pedido', async () => {
      const { useCase, gateway, payments, ordersService, metaConversions } =
        makeUseCase();
      gateway.getPayment.mockResolvedValue({
        status: 'approved',
        externalReference: existingPayment.orderNumber,
      });
      payments.findMostRecentByOrderNumber.mockResolvedValue(existingPayment);
      ordersService.createConfirmedOrder.mockResolvedValue({
        id: 'order-9',
        orderNumber: existingPayment.orderNumber,
        total: 50000,
        fbp: 'fb.p.1',
        fbc: 'fb.c.1',
        shippingInfo: existingPayment.draftPayload.shippingInfo,
        items: existingPayment.draftPayload.itemsData,
      });
      const signature = firmarWebhook('mp-1', 'req-1');

      await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

      expect(metaConversions.sendPurchase).toHaveBeenCalledWith({
        orderNumber: existingPayment.orderNumber,
        total: 50000,
        contentIds: ['prod-1'],
        user: {
          email: 'cliente@test.com',
          phone: '3000000000',
          firstName: 'Cliente',
          lastName: 'Test',
          city: 'Bogota',
          state: 'Bogota',
          fbp: 'fb.p.1',
          fbc: 'fb.c.1',
        },
      });
    });

    it('si falta el draftPayload, no crea el pedido y registra el error', async () => {
      const { useCase, gateway, payments, ordersService, mail } = makeUseCase();
      gateway.getPayment.mockResolvedValue({
        status: 'approved',
        externalReference: existingPayment.orderNumber,
      });
      payments.findMostRecentByOrderNumber.mockResolvedValue({
        ...existingPayment,
        draftPayload: null,
      });
      const signature = firmarWebhook('mp-1', 'req-1');

      await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

      expect(ordersService.createConfirmedOrder).not.toHaveBeenCalled();
      expect(mail.sendPaymentConfirmation).not.toHaveBeenCalled();
    });

    it('si no hay stock para crear el pedido, avisa al admin y no lanza', async () => {
      const { useCase, gateway, payments, ordersService, mail } = makeUseCase({
        ADMIN_EMAIL: 'admin@c3lect.com',
      });
      gateway.getPayment.mockResolvedValue({
        status: 'approved',
        externalReference: existingPayment.orderNumber,
      });
      payments.findMostRecentByOrderNumber.mockResolvedValue(existingPayment);
      ordersService.createConfirmedOrder.mockRejectedValue(
        new BadRequestException('Stock insuficiente'),
      );
      const signature = firmarWebhook('mp-1', 'req-1');

      await expect(
        useCase.execute(webhookDto('mp-1'), signature, 'req-1'),
      ).resolves.toBeUndefined();

      expect(mail.sendStockAlert).toHaveBeenCalledWith(
        'admin@c3lect.com',
        existingPayment.orderNumber,
        expect.any(String),
      );
      expect(payments.linkToOrder).not.toHaveBeenCalled();
    });

    it('si no hay stock y no hay ADMIN_EMAIL configurado, no intenta avisar a nadie', async () => {
      const { useCase, gateway, payments, ordersService, mail } = makeUseCase();
      gateway.getPayment.mockResolvedValue({
        status: 'approved',
        externalReference: existingPayment.orderNumber,
      });
      payments.findMostRecentByOrderNumber.mockResolvedValue(existingPayment);
      ordersService.createConfirmedOrder.mockRejectedValue(
        new BadRequestException('Stock insuficiente'),
      );
      const signature = firmarWebhook('mp-1', 'req-1');

      await expect(
        useCase.execute(webhookDto('mp-1'), signature, 'req-1'),
      ).resolves.toBeUndefined();

      expect(mail.sendStockAlert).not.toHaveBeenCalled();
    });

    it('no envia comprobante al cliente si el pedido quedo sin shippingInfo', async () => {
      const {
        useCase,
        gateway,
        payments,
        ordersService,
        mail,
        metaConversions,
      } = makeUseCase();
      gateway.getPayment.mockResolvedValue({
        status: 'approved',
        externalReference: existingPayment.orderNumber,
      });
      payments.findMostRecentByOrderNumber.mockResolvedValue(existingPayment);
      ordersService.createConfirmedOrder.mockResolvedValue({
        id: 'order-9',
        orderNumber: existingPayment.orderNumber,
        total: 50000,
        fbp: null,
        fbc: null,
        shippingInfo: null,
        items: existingPayment.draftPayload.itemsData,
      });
      const signature = firmarWebhook('mp-1', 'req-1');

      await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

      expect(mail.sendPaymentConfirmation).not.toHaveBeenCalled();
      expect(metaConversions.sendPurchase).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ email: undefined }),
        }),
      );
    });
  });

  describe('pago aprobado, flujo viejo (pedido ya existia PENDIENTE)', () => {
    const paymentConOrder = {
      ...existingPayment,
      orderId: 'order-5',
      draftPayload: null,
    };
    const ordenExistente = {
      id: 'order-5',
      orderNumber: existingPayment.orderNumber,
      status: EstadoPedido.PENDIENTE,
      total: 80000,
      fbp: null,
      fbc: null,
      shippingInfo: {
        email: 'legacy@test.com',
        nombreCompleto: 'Legacy Cliente',
        telefono: '3001234567',
        ciudad: 'Cali',
        departamento: 'Valle',
      },
      items: [
        {
          productId: 'prod-2',
          nombre: 'Correa',
          cantidad: 1,
          precioUnitario: 80000,
          subtotal: 80000,
        },
      ],
    };

    it('confirma el pedido existente sin duplicar el email de estado', async () => {
      const { useCase, gateway, payments, orderRepository, ordersService } =
        makeUseCase();
      gateway.getPayment.mockResolvedValue({
        status: 'approved',
        externalReference: existingPayment.orderNumber,
      });
      payments.findMostRecentByOrderNumber.mockResolvedValue(paymentConOrder);
      orderRepository.findByIdForPayment.mockResolvedValue(ordenExistente);
      const signature = firmarWebhook('mp-1', 'req-1');

      await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

      expect(ordersService.updateStatus).toHaveBeenCalledWith(
        'order-5',
        { status: EstadoPedido.CONFIRMADO },
        'MERCADOPAGO',
        true,
      );
      expect(ordersService.createConfirmedOrder).not.toHaveBeenCalled();
    });

    it('no hace nada si el pedido legado ya no esta PENDIENTE', async () => {
      const { useCase, gateway, payments, orderRepository, ordersService } =
        makeUseCase();
      gateway.getPayment.mockResolvedValue({
        status: 'approved',
        externalReference: existingPayment.orderNumber,
      });
      payments.findMostRecentByOrderNumber.mockResolvedValue(paymentConOrder);
      orderRepository.findByIdForPayment.mockResolvedValue({
        ...ordenExistente,
        status: EstadoPedido.CANCELADO,
      });
      const signature = firmarWebhook('mp-1', 'req-1');

      await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

      expect(ordersService.updateStatus).not.toHaveBeenCalled();
    });

    it('si no puede confirmar el pedido legado, avisa al admin y no envia comprobante', async () => {
      const {
        useCase,
        gateway,
        payments,
        orderRepository,
        ordersService,
        mail,
      } = makeUseCase({
        ADMIN_EMAIL: 'admin@c3lect.com',
      });
      gateway.getPayment.mockResolvedValue({
        status: 'approved',
        externalReference: existingPayment.orderNumber,
      });
      payments.findMostRecentByOrderNumber.mockResolvedValue(paymentConOrder);
      orderRepository.findByIdForPayment.mockResolvedValue(ordenExistente);
      ordersService.updateStatus.mockRejectedValue(new Error('DB caida'));
      const signature = firmarWebhook('mp-1', 'req-1');

      await expect(
        useCase.execute(webhookDto('mp-1'), signature, 'req-1'),
      ).resolves.toBeUndefined();

      expect(mail.sendStockAlert).toHaveBeenCalledWith(
        'admin@c3lect.com',
        existingPayment.orderNumber,
        'DB caida',
      );
    });
  });

  describe('pago rechazado o cancelado', () => {
    it('cancela el pedido legado si estaba PENDIENTE', async () => {
      const { useCase, gateway, payments, orderRepository, ordersService } =
        makeUseCase();
      gateway.getPayment.mockResolvedValue({
        status: 'rejected',
        externalReference: existingPayment.orderNumber,
      });
      payments.findMostRecentByOrderNumber.mockResolvedValue({
        ...existingPayment,
        orderId: 'order-5',
      });
      orderRepository.findByIdForPayment.mockResolvedValue({
        id: 'order-5',
        status: EstadoPedido.PENDIENTE,
      });
      const signature = firmarWebhook('mp-1', 'req-1');

      await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

      expect(ordersService.updateStatus).toHaveBeenCalledWith(
        'order-5',
        { status: EstadoPedido.CANCELADO },
        'MERCADOPAGO',
      );
    });

    it('no hace nada si el pago rechazado nunca tuvo un pedido asociado (flujo nuevo)', async () => {
      const { useCase, gateway, payments, orderRepository, ordersService } =
        makeUseCase();
      gateway.getPayment.mockResolvedValue({
        status: 'cancelled',
        externalReference: existingPayment.orderNumber,
      });
      payments.findMostRecentByOrderNumber.mockResolvedValue(existingPayment);
      const signature = firmarWebhook('mp-1', 'req-1');

      await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

      expect(ordersService.updateStatus).not.toHaveBeenCalled();
      expect(orderRepository.findByIdForPayment).not.toHaveBeenCalled();
    });

    it('no hace nada si el pedido legado del pago rechazado ya no existe', async () => {
      const { useCase, gateway, payments, orderRepository, ordersService } =
        makeUseCase();
      gateway.getPayment.mockResolvedValue({
        status: 'rejected',
        externalReference: existingPayment.orderNumber,
      });
      payments.findMostRecentByOrderNumber.mockResolvedValue({
        ...existingPayment,
        orderId: 'order-5',
      });
      orderRepository.findByIdForPayment.mockResolvedValue(null);
      const signature = firmarWebhook('mp-1', 'req-1');

      await useCase.execute(webhookDto('mp-1'), signature, 'req-1');

      expect(ordersService.updateStatus).not.toHaveBeenCalled();
    });
  });

  it('atrapa errores inesperados al consultar el pago en MercadoPago y no los propaga', async () => {
    const { useCase, gateway } = makeUseCase();
    gateway.getPayment.mockRejectedValue(new Error('timeout MercadoPago'));
    const signature = firmarWebhook('mp-1', 'req-1');

    await expect(
      useCase.execute(webhookDto('mp-1'), signature, 'req-1'),
    ).resolves.toBeUndefined();
  });
});
