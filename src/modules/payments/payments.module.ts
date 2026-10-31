import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ORDERS } from './application/ports/orders.port';
import { PAYMENT_GATEWAY } from './application/ports/payment-gateway.port';
import { PAYMENT_REPOSITORY } from './application/ports/payment-repository.port';
import { PAYMENT_SETTINGS } from './application/ports/payment-settings.port';
import { VOUCHER_GENERATOR } from './application/ports/voucher-generator.port';
import { CreatePaymentUseCase } from './application/use-cases/create-payment.use-case';
import { CreatePendingOrderPaymentUseCase } from './application/use-cases/create-pending-order-payment.use-case';
import { GetPaymentUseCase } from './application/use-cases/get-payment.use-case';
import { HandleWebhookUseCase } from './application/use-cases/handle-webhook.use-case';
import { ConfigPaymentSettings } from './infrastructure/adapters/config-payment-settings';
import { OrdersFacadeAdapter } from './infrastructure/adapters/orders-facade.adapter';
import { MercadoPagoPaymentGateway } from './infrastructure/gateways/mercadopago-payment.gateway';
import { PdfVoucherGenerator } from './infrastructure/gateways/pdf-voucher.generator';
import { PaymentsController } from './infrastructure/http/payments.controller';
import { PrismaPaymentRepository } from './infrastructure/persistence/prisma-payment.repository';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [
    CreatePaymentUseCase,
    CreatePendingOrderPaymentUseCase,
    HandleWebhookUseCase,
    GetPaymentUseCase,
    { provide: ORDERS, useClass: OrdersFacadeAdapter },
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
    { provide: PAYMENT_GATEWAY, useClass: MercadoPagoPaymentGateway },
    { provide: VOUCHER_GENERATOR, useClass: PdfVoucherGenerator },
    { provide: PAYMENT_SETTINGS, useClass: ConfigPaymentSettings },
  ],
})
export class PaymentsModule {}
