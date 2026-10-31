import { Module } from '@nestjs/common';
import { PROMOTIONS_REPOSITORY } from './application/ports/promotions-repository.port';
import { PromotionsFacade } from './application/promotions.facade';
import { PromotionsService } from './application/promotions.service';
import { PromotionsController } from './infrastructure/http/promotions.controller';
import { PromotionsRepository } from './infrastructure/persistence/promotions.repository';

@Module({
  controllers: [PromotionsController],
  providers: [
    PromotionsService,
    PromotionsFacade,
    { provide: PROMOTIONS_REPOSITORY, useClass: PromotionsRepository },
  ],
  exports: [PromotionsFacade],
})
export class PromotionsModule {}
