import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MailModule } from '../../mail/mail.module';
import { OrdersModule } from '../orders/orders.module';
import { MetaConversionsModule } from '../meta-conversions/meta-conversions.module';

@Module({
  imports: [MailModule, OrdersModule, MetaConversionsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
