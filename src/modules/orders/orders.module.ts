import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { MailModule } from '../../mail/mail.module';
import { AuditModule } from '../audit/audit.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { MetaConversionsModule } from '../meta-conversions/meta-conversions.module';

@Module({
  imports: [MailModule, AuditModule, PromotionsModule, MetaConversionsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
