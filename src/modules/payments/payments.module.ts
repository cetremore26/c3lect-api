import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MailModule } from '../../mail/mail.module';
import { OrdersModule } from '../orders/orders.module';
import { MetaConversionsModule } from '../meta-conversions/meta-conversions.module';
import { PAYMENT_REPOSITORY } from './application/ports/payment-repository.port';
import { PAYMENT_GATEWAY } from './application/ports/payment-gateway.port';
import { VOUCHER_GENERATOR } from './application/ports/voucher-generator.port';
import { PrismaPaymentRepository } from './infrastructure/prisma-payment.repository';
import { MercadoPagoPaymentGateway } from './infrastructure/mercadopago-payment.gateway';
import { PdfVoucherGenerator } from './infrastructure/pdf-voucher.generator';
import { CreatePaymentUseCase } from './application/use-cases/create-payment.use-case';
import { CreatePendingOrderPaymentUseCase } from './application/use-cases/create-pending-order-payment.use-case';
import { HandleWebhookUseCase } from './application/use-cases/handle-webhook.use-case';
import { GetPaymentUseCase } from './application/use-cases/get-payment.use-case';

@Module({
  imports: [MailModule, OrdersModule, MetaConversionsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    CreatePaymentUseCase,
    CreatePendingOrderPaymentUseCase,
    HandleWebhookUseCase,
    GetPaymentUseCase,
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
    { provide: PAYMENT_GATEWAY, useClass: MercadoPagoPaymentGateway },
    { provide: VOUCHER_GENERATOR, useClass: PdfVoucherGenerator },
  ],
})
export class PaymentsModule {}
