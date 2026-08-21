import { Module } from '@nestjs/common';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { PromotionsRepository } from './promotions.repository';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [PromotionsController],
  providers: [PromotionsService, PromotionsRepository],
  exports: [PromotionsService],
})
export class PromotionsModule {}
