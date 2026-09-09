import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { EstadoPago, EstadoPedido } from '@prisma/client';
import { createHmac } from 'crypto';
import { PaymentsService } from './payments.service';

jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn(),
  Preference: jest.fn(),
  Payment: jest.fn(),
}));

import { Preference, Payment as MpPayment } from 'mercadopago';

const mockedPreference = Preference as unknown as jest.Mock;
const mockedMpPayment = MpPayment as unknown as jest.Mock;

const WEBHOOK_SECRET = 'test-secret';

function firmarWebhook(dataId: string, requestId: string, ts = '1700000000') {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');
  return `ts=${ts},v1=${v1}`;
}

function crearPrisma() {
  return {
    order: { findUnique: jest.fn() },
    payment: {
      create: jest.fn().mockResolvedValue({ id: 'payment-1' }),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function crearMail() {
  return {
    sendPaymentConfirmation: jest.fn().mockResolvedValue(undefined),
    sendStockAlert: jest.fn().mockResolvedValue(undefined),
  };
}

function crearConfig(envs: Record<string, string | undefined>) {
  return {
    getOrThrow: jest.fn((key: string) => {
      const value = envs[key];
      if (value === undefined) throw new Error(`Falta config ${key}`);
      return value;
    }),
    get: jest.fn((key: string) => envs[key]),
  };
}

function crearOrdersService() {
  return {
    resolveItems: jest.fn(),
    createConfirmedOrder: jest.fn(),
    updateStatus: jest.fn().mockResolvedValue(undefined),
  };
}

function crearMetaConversions() {
  return { sendPurchase: jest.fn().mockResolvedValue(undefined) };
}

describe('PaymentsService', () => {
  let prisma: ReturnType<typeof crearPrisma>;
  let mail: ReturnType<typeof crearMail>;
  let config: ReturnType<typeof crearConfig>;
  let ordersService: ReturnType<typeof crearOrdersService>;
  let metaConversions: ReturnType<typeof crearMetaConversions>;
  let service: PaymentsService;
  let preferenceCreate: jest.Mock;
  let mpPaymentGet: jest.Mock;
  let envs: Record<string, string | undefined>;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    envs = {
      MP_ACCESS_TOKEN: 'mp-token',
      FRONTEND_URL: 'https://c3lect.com',
      API_URL: 'https://api.c3lect.com',
      MP_WEBHOOK_SECRET: WEBHOOK_SECRET,
      ADMIN_EMAIL: undefined,
    };

    preferenceCreate = jest.fn().mockResolvedValue({
      id: 'pref-1',
      init_point: 'https://mp.com/checkout/pref-1',
      sandbox_init_point: 'https://mp.com/sandbox/pref-1',
    });
    mockedPreference.mockImplementation(() => ({ create: preferenceCreate }));

    mpPaymentGet = jest.fn();
    mockedMpPayment.mockImplementation(() => ({ get: mpPaymentGet }));

    prisma = crearPrisma();
    mail = crearMail();
    config = crearConfig(envs);
    ordersService = crearOrdersService();
    metaConversions = crearMetaConversions();

    service = new PaymentsService(
      prisma as any,
      mail as any,
      config as any,
      ordersService as any,
      metaConversions as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createPayment', () => {
    const orderBase = {
      id: 'order-1',
      orderNumber: 'C3L-20260101-ABCDE',
      status: EstadoPedido.PENDIENTE,
      total: 150000,
      items: [
        {
          productId: 'prod-1',
          nombre: 'Reloj',
          cantidad: 2,
          precioUnitario: 50000,
        },
      ],
      shippingInfo: { email: 'cliente@test.com' },
    };

    it('lanza NotFoundException si el pedido no existe', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.createPayment({ orderId: 'nope' })).rejects.toThrow(
        NotFoundException,
      );
      expect(preferenceCreate).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si el pedido ya no esta PENDIENTE', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...orderBase,
        status: EstadoPedido.CONFIRMADO,
      });

      await expect(
        service.createPayment({ orderId: 'order-1' }),
      ).rejects.toThrow(BadRequestException);
      expect(preferenceCreate).not.toHaveBeenCalled();
    });

    it('crea la preferencia con los items y urls del pedido', async () => {
      prisma.order.findUnique.mockResolvedValue(orderBase);

      await service.createPayment({ orderId: 'order-1' }, 'user-1');

      expect(preferenceCreate).toHaveBeenCalledWith({
        body: expect.objectContaining({
          items: [
            {
              id: 'prod-1',
              title: 'Reloj',
              quantity: 2,
              unit_price: 50000,
              currency_id: 'COP',
            },
          ],
          payer: { email: 'cliente@test.com' },
          external_reference: 'C3L-20260101-ABCDE',
          back_urls: {
            success: 'https://c3lect.com/checkout/success',
            failure: 'https://c3lect.com/checkout/failure',
            pending: 'https://c3lect.com/checkout/pending',
          },
          notification_url: 'https://api.c3lect.com/payments/webhook',
        }),
      });
    });

    it('usa un email generico cuando el pedido no tiene shippingInfo', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...orderBase,
        shippingInfo: null,
      });

      await service.createPayment({ orderId: 'order-1' });

      expect(preferenceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            payer: { email: 'cliente@c3lect.com' },
          }),
        }),
      );
    });

    it('registra el pago con el total del pedido y el userId', async () => {
      prisma.order.findUnique.mockResolvedValue(orderBase);

      await service.createPayment({ orderId: 'order-1' }, 'user-1');

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          orderNumber: 'C3L-20260101-ABCDE',
          userId: 'user-1',
          estado: EstadoPago.PENDIENTE,
          preferenceId: 'pref-1',
          checkoutUrl: 'https://mp.com/checkout/pref-1',
          total: 150000,
        },
      });
    });

    it('cae al sandbox_init_point si no hay init_point (credenciales de prueba)', async () => {
      preferenceCreate.mockResolvedValue({
        id: 'pref-1',
        sandbox_init_point: 'https://mp.com/sandbox/pref-1',
      });
      prisma.order.findUnique.mockResolvedValue(orderBase);

      const result = await service.createPayment({ orderId: 'order-1' });

      expect(result.checkoutUrl).toBe('https://mp.com/sandbox/pref-1');
    });

    it('devuelve checkoutUrl, preferenceId y paymentId', async () => {
      prisma.order.findUnique.mockResolvedValue(orderBase);
      prisma.payment.create.mockResolvedValue({ id: 'payment-9' });

      const result = await service.createPayment({ orderId: 'order-1' });

      expect(result).toEqual({
        checkoutUrl: 'https://mp.com/checkout/pref-1',
        preferenceId: 'pref-1',
        paymentId: 'payment-9',
      });
    });

    it('deja checkoutUrl en cadena vacia si MercadoPago no manda ninguna url', async () => {
      preferenceCreate.mockResolvedValue({ id: 'pref-1' });
      prisma.order.findUnique.mockResolvedValue(orderBase);

      const result = await service.createPayment({ orderId: 'order-1' });

      expect(result.checkoutUrl).toBe('');
    });

    it('guarda preferenceId en null si MercadoPago no devuelve id', async () => {
      preferenceCreate.mockResolvedValue({
        init_point: 'https://mp.com/checkout/pref-1',
      });
      prisma.order.findUnique.mockResolvedValue(orderBase);

      await service.createPayment({ orderId: 'order-1' });

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ preferenceId: null }),
        }),
      );
    });
  });

  describe('createPendingOrderPayment', () => {
    const dto = {
      items: [{ productId: 'prod-1', cantidad: 1 }],
      shippingInfo: {
        email: 'cliente@test.com',
        nombreCompleto: 'Cliente Test',
        telefono: '3000000000',
        ciudad: 'Bogota',
        departamento: 'Bogota',
        direccion: 'Calle 1',
      },
      fbp: 'fb.p.1',
      fbc: 'fb.c.1',
    } as any;

    const resolved = {
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
    };

    beforeEach(() => {
      ordersService.resolveItems.mockResolvedValue(resolved);
    });

    it('resuelve los items server-side marcando al usuario como autenticado si hay userId', async () => {
      await service.createPendingOrderPayment(dto, 'user-1');

      expect(ordersService.resolveItems).toHaveBeenCalledWith(dto.items, true);
    });

    it('trata al comprador como invitado si no hay userId', async () => {
      await service.createPendingOrderPayment(dto);

      expect(ordersService.resolveItems).toHaveBeenCalledWith(dto.items, false);
    });

    it('crea el pago sin orderId y con el draftPayload congelado', async () => {
      await service.createPendingOrderPayment(dto, 'user-1');

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: null,
          userId: 'user-1',
          estado: EstadoPago.PENDIENTE,
          total: 50000,
          draftPayload: expect.objectContaining({
            itemsData: resolved.itemsData,
            subtotal: 50000,
            total: 50000,
            shippingInfo: dto.shippingInfo,
            userId: 'user-1',
            fbp: 'fb.p.1',
            fbc: 'fb.c.1',
          }),
        }),
      });
    });

    it('usa el email del shippingInfo del dto para la preferencia', async () => {
      await service.createPendingOrderPayment(dto);

      expect(preferenceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            payer: { email: 'cliente@test.com' },
          }),
        }),
      );
    });

    it('cae al sandbox_init_point si no hay init_point', async () => {
      preferenceCreate.mockResolvedValue({
        id: 'pref-1',
        sandbox_init_point: 'https://mp.com/sandbox/pref-1',
      });

      const result = await service.createPendingOrderPayment(dto);

      expect(result.checkoutUrl).toBe('https://mp.com/sandbox/pref-1');
    });

    it('deja checkoutUrl en cadena vacia si MercadoPago no manda ninguna url', async () => {
      preferenceCreate.mockResolvedValue({ id: 'pref-1' });

      const result = await service.createPendingOrderPayment(dto);

      expect(result.checkoutUrl).toBe('');
    });

    it('guarda preferenceId en null si MercadoPago no devuelve id', async () => {
      preferenceCreate.mockResolvedValue({
        init_point: 'https://mp.com/checkout/pref-1',
      });

      await service.createPendingOrderPayment(dto);

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ preferenceId: null }),
        }),
      );
    });

    it('congela fbp y fbc en null cuando el dto no trae cookies de Meta Pixel', async () => {
      const dtoSinCookies = {
        items: dto.items,
        shippingInfo: dto.shippingInfo,
      } as any;

      await service.createPendingOrderPayment(dtoSinCookies);

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            draftPayload: expect.objectContaining({ fbp: null, fbc: null }),
          }),
        }),
      );
    });
  });

  describe('getByOrderId', () => {
    it('devuelve el pago mas reciente del pedido', async () => {
      prisma.payment.findFirst.mockResolvedValue({ id: 'payment-1' });

      const result = await service.getByOrderId('order-1');

      expect(result).toEqual({ id: 'payment-1' });
      expect(prisma.payment.findFirst).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('lanza NotFoundException si no hay pago para el pedido', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.getByOrderId('order-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('handleWebhook', () => {
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

    function webhookDto(id = 'mp-1') {
      return { type: 'payment', data: { id } } as any;
    }

    it('ignora notificaciones que no son de tipo payment', async () => {
      await service.handleWebhook(
        { type: 'merchant_order', data: { id: '1' } },
        'x',
        'y',
      );

      expect(prisma.payment.findFirst).not.toHaveBeenCalled();
      expect(mpPaymentGet).not.toHaveBeenCalled();
    });

    it('rechaza el webhook si faltan los headers de firma', async () => {
      await service.handleWebhook(webhookDto(), undefined, undefined);

      expect(mpPaymentGet).not.toHaveBeenCalled();
    });

    it('rechaza el webhook si la firma no coincide', async () => {
      await service.handleWebhook(
        webhookDto('mp-1'),
        'ts=123,v1=firma-invalida',
        'req-1',
      );

      expect(mpPaymentGet).not.toHaveBeenCalled();
    });

    it('rechaza el webhook si el header de firma no trae ts o v1', async () => {
      await service.handleWebhook(
        webhookDto('mp-1'),
        'formato-sin-partes-validas',
        'req-1',
      );

      expect(mpPaymentGet).not.toHaveBeenCalled();
    });

    it('rechaza el webhook si algo inesperado falla parseando la firma', async () => {
      const xSignatureRota = {
        split: () => {
          throw new Error('no es un string');
        },
      } as unknown as string;

      await service.handleWebhook(webhookDto('mp-1'), xSignatureRota, 'req-1');

      expect(mpPaymentGet).not.toHaveBeenCalled();
    });

    it('rechaza el webhook si no puede verificar la firma (falta MP_WEBHOOK_SECRET)', async () => {
      envs.MP_WEBHOOK_SECRET = undefined;
      const signature = firmarWebhook('mp-1', 'req-1');

      await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

      expect(mpPaymentGet).not.toHaveBeenCalled();
    });

    it('ignora el pago si MercadoPago no manda external_reference', async () => {
      mpPaymentGet.mockResolvedValue({
        status: 'approved',
        external_reference: null,
      });
      const signature = firmarWebhook('mp-1', 'req-1');

      await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

      expect(prisma.payment.findFirst).not.toHaveBeenCalled();
    });

    it('ignora el pago si no hay un registro de Payment para ese orderNumber', async () => {
      mpPaymentGet.mockResolvedValue({
        status: 'approved',
        external_reference: 'C3L-nope',
      });
      prisma.payment.findFirst.mockResolvedValue(null);
      const signature = firmarWebhook('mp-1', 'req-1');

      await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('no reprocesa un webhook si otra entrega ya dejo el pago en estado terminal', async () => {
      mpPaymentGet.mockResolvedValue({
        status: 'approved',
        external_reference: existingPayment.orderNumber,
      });
      prisma.payment.findFirst.mockResolvedValue(existingPayment);
      prisma.payment.updateMany.mockResolvedValue({ count: 0 });
      const signature = firmarWebhook('mp-1', 'req-1');

      await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

      expect(ordersService.createConfirmedOrder).not.toHaveBeenCalled();
      expect(mail.sendPaymentConfirmation).not.toHaveBeenCalled();
    });

    it('un pago pending no dispara confirmacion ni cancelacion de pedido', async () => {
      mpPaymentGet.mockResolvedValue({
        status: 'pending',
        external_reference: existingPayment.orderNumber,
      });
      prisma.payment.findFirst.mockResolvedValue(existingPayment);
      const signature = firmarWebhook('mp-1', 'req-1');

      await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'payment-1',
          estado: {
            notIn: [
              EstadoPago.APROBADO,
              EstadoPago.RECHAZADO,
              EstadoPago.CANCELADO,
            ],
          },
        },
        data: { estado: EstadoPago.PENDIENTE, mpPaymentId: 'mp-1' },
      });
      expect(ordersService.createConfirmedOrder).not.toHaveBeenCalled();
      expect(ordersService.updateStatus).not.toHaveBeenCalled();
    });

    it('un status desconocido o ausente de MercadoPago se trata como PENDIENTE', async () => {
      mpPaymentGet.mockResolvedValue({
        status: undefined,
        external_reference: existingPayment.orderNumber,
      });
      prisma.payment.findFirst.mockResolvedValue(existingPayment);
      const signature = firmarWebhook('mp-1', 'req-1');

      await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { estado: EstadoPago.PENDIENTE, mpPaymentId: 'mp-1' },
        }),
      );
      expect(ordersService.createConfirmedOrder).not.toHaveBeenCalled();
      expect(ordersService.updateStatus).not.toHaveBeenCalled();
    });

    describe('pago aprobado, flujo nuevo (sin orderId)', () => {
      it('crea el pedido confirmado a partir del draftPayload y enlaza el pago', async () => {
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(existingPayment);
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

        await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

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
        expect(prisma.payment.update).toHaveBeenCalledWith({
          where: { id: 'payment-1' },
          data: { orderId: 'order-9' },
        });
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
        envs.ADMIN_EMAIL = 'admin@c3lect.com';
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(existingPayment);
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

        await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

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
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(existingPayment);
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

        await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

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
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue({
          ...existingPayment,
          draftPayload: null,
        });
        const signature = firmarWebhook('mp-1', 'req-1');

        await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

        expect(ordersService.createConfirmedOrder).not.toHaveBeenCalled();
        expect(mail.sendPaymentConfirmation).not.toHaveBeenCalled();
      });

      it('si no hay stock para crear el pedido, avisa al admin y no lanza', async () => {
        envs.ADMIN_EMAIL = 'admin@c3lect.com';
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(existingPayment);
        ordersService.createConfirmedOrder.mockRejectedValue(
          new BadRequestException('Stock insuficiente'),
        );
        const signature = firmarWebhook('mp-1', 'req-1');

        await expect(
          service.handleWebhook(webhookDto('mp-1'), signature, 'req-1'),
        ).resolves.toBeUndefined();

        expect(mail.sendStockAlert).toHaveBeenCalledWith(
          'admin@c3lect.com',
          existingPayment.orderNumber,
          expect.any(String),
        );
        expect(prisma.payment.update).not.toHaveBeenCalled();
      });

      it('si no hay stock y no hay ADMIN_EMAIL configurado, no intenta avisar a nadie', async () => {
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(existingPayment);
        ordersService.createConfirmedOrder.mockRejectedValue(
          new BadRequestException('Stock insuficiente'),
        );
        const signature = firmarWebhook('mp-1', 'req-1');

        await expect(
          service.handleWebhook(webhookDto('mp-1'), signature, 'req-1'),
        ).resolves.toBeUndefined();

        expect(mail.sendStockAlert).not.toHaveBeenCalled();
      });

      it('si el rechazo al crear el pedido no es un Error, usa String(err) como detalle', async () => {
        envs.ADMIN_EMAIL = 'admin@c3lect.com';
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(existingPayment);
        ordersService.createConfirmedOrder.mockRejectedValue(
          'sin stock, sin Error',
        );
        const signature = firmarWebhook('mp-1', 'req-1');

        await expect(
          service.handleWebhook(webhookDto('mp-1'), signature, 'req-1'),
        ).resolves.toBeUndefined();

        expect(mail.sendStockAlert).toHaveBeenCalledWith(
          'admin@c3lect.com',
          existingPayment.orderNumber,
          'sin stock, sin Error',
        );
      });

      it('no envia comprobante al cliente si el pedido quedo sin shippingInfo', async () => {
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(existingPayment);
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

        await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

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
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(paymentConOrder);
        prisma.order.findUnique.mockResolvedValue(ordenExistente);
        const signature = firmarWebhook('mp-1', 'req-1');

        await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

        expect(ordersService.updateStatus).toHaveBeenCalledWith(
          'order-5',
          { status: EstadoPedido.CONFIRMADO },
          'MERCADOPAGO',
          true,
        );
        expect(ordersService.createConfirmedOrder).not.toHaveBeenCalled();
      });

      it('no hace nada si el pedido legado ya no esta PENDIENTE', async () => {
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(paymentConOrder);
        prisma.order.findUnique.mockResolvedValue({
          ...ordenExistente,
          status: EstadoPedido.CANCELADO,
        });
        const signature = firmarWebhook('mp-1', 'req-1');

        await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

        expect(ordersService.updateStatus).not.toHaveBeenCalled();
        expect(mail.sendPaymentConfirmation).not.toHaveBeenCalled();
      });

      it('si no puede confirmar el pedido legado, avisa al admin y no envia comprobante', async () => {
        envs.ADMIN_EMAIL = 'admin@c3lect.com';
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(paymentConOrder);
        prisma.order.findUnique.mockResolvedValue(ordenExistente);
        ordersService.updateStatus.mockRejectedValue(new Error('DB caida'));
        const signature = firmarWebhook('mp-1', 'req-1');

        await expect(
          service.handleWebhook(webhookDto('mp-1'), signature, 'req-1'),
        ).resolves.toBeUndefined();

        expect(mail.sendStockAlert).toHaveBeenCalledWith(
          'admin@c3lect.com',
          existingPayment.orderNumber,
          'DB caida',
        );
        expect(mail.sendPaymentConfirmation).not.toHaveBeenCalled();
      });

      it('si no puede confirmar el pedido legado y no hay ADMIN_EMAIL, no intenta avisar', async () => {
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(paymentConOrder);
        prisma.order.findUnique.mockResolvedValue(ordenExistente);
        ordersService.updateStatus.mockRejectedValue(new Error('DB caida'));
        const signature = firmarWebhook('mp-1', 'req-1');

        await expect(
          service.handleWebhook(webhookDto('mp-1'), signature, 'req-1'),
        ).resolves.toBeUndefined();

        expect(mail.sendStockAlert).not.toHaveBeenCalled();
      });

      it('si el rechazo al confirmar no es un Error, usa String(err) como detalle', async () => {
        envs.ADMIN_EMAIL = 'admin@c3lect.com';
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(paymentConOrder);
        prisma.order.findUnique.mockResolvedValue(ordenExistente);
        ordersService.updateStatus.mockRejectedValue('DB caida sin Error');
        const signature = firmarWebhook('mp-1', 'req-1');

        await expect(
          service.handleWebhook(webhookDto('mp-1'), signature, 'req-1'),
        ).resolves.toBeUndefined();

        expect(mail.sendStockAlert).toHaveBeenCalledWith(
          'admin@c3lect.com',
          existingPayment.orderNumber,
          'DB caida sin Error',
        );
      });

      it('el comprobante trunca nombres de producto de mas de 42 caracteres', async () => {
        mpPaymentGet.mockResolvedValue({
          status: 'approved',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(paymentConOrder);
        prisma.order.findUnique.mockResolvedValue({
          ...ordenExistente,
          items: [
            {
              productId: 'prod-2',
              nombre:
                'Reloj Fossil Chicago Edicion Especial Coleccionista Limitada',
              cantidad: 1,
              precioUnitario: 80000,
              subtotal: 80000,
            },
          ],
        });
        const signature = firmarWebhook('mp-1', 'req-1');

        await expect(
          service.handleWebhook(webhookDto('mp-1'), signature, 'req-1'),
        ).resolves.toBeUndefined();

        expect(mail.sendPaymentConfirmation).toHaveBeenCalledWith(
          'legacy@test.com',
          'Legacy Cliente',
          existingPayment.orderNumber,
          80000,
          expect.any(Buffer),
        );
      });
    });

    describe('pago rechazado o cancelado', () => {
      it('cancela el pedido legado si estaba PENDIENTE', async () => {
        mpPaymentGet.mockResolvedValue({
          status: 'rejected',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue({
          ...existingPayment,
          orderId: 'order-5',
        });
        prisma.order.findUnique.mockResolvedValue({
          id: 'order-5',
          status: EstadoPedido.PENDIENTE,
        });
        const signature = firmarWebhook('mp-1', 'req-1');

        await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

        expect(ordersService.updateStatus).toHaveBeenCalledWith(
          'order-5',
          { status: EstadoPedido.CANCELADO },
          'MERCADOPAGO',
        );
      });

      it('no hace nada si el pago rechazado nunca tuvo un pedido asociado (flujo nuevo)', async () => {
        mpPaymentGet.mockResolvedValue({
          status: 'cancelled',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue(existingPayment);
        const signature = firmarWebhook('mp-1', 'req-1');

        await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

        expect(ordersService.updateStatus).not.toHaveBeenCalled();
        expect(prisma.order.findUnique).not.toHaveBeenCalled();
      });

      it('no hace nada si el pedido legado del pago rechazado ya no existe', async () => {
        mpPaymentGet.mockResolvedValue({
          status: 'rejected',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue({
          ...existingPayment,
          orderId: 'order-5',
        });
        prisma.order.findUnique.mockResolvedValue(null);
        const signature = firmarWebhook('mp-1', 'req-1');

        await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

        expect(ordersService.updateStatus).not.toHaveBeenCalled();
      });

      it('no hace nada si el pedido legado del pago rechazado ya no esta PENDIENTE', async () => {
        mpPaymentGet.mockResolvedValue({
          status: 'rejected',
          external_reference: existingPayment.orderNumber,
        });
        prisma.payment.findFirst.mockResolvedValue({
          ...existingPayment,
          orderId: 'order-5',
        });
        prisma.order.findUnique.mockResolvedValue({
          id: 'order-5',
          status: EstadoPedido.CONFIRMADO,
        });
        const signature = firmarWebhook('mp-1', 'req-1');

        await service.handleWebhook(webhookDto('mp-1'), signature, 'req-1');

        expect(ordersService.updateStatus).not.toHaveBeenCalled();
      });
    });

    it('atrapa errores inesperados al consultar el pago en MercadoPago y no los propaga', async () => {
      mpPaymentGet.mockRejectedValue(new Error('timeout MercadoPago'));
      const signature = firmarWebhook('mp-1', 'req-1');

      await expect(
        service.handleWebhook(webhookDto('mp-1'), signature, 'req-1'),
      ).resolves.toBeUndefined();
    });
  });
});
