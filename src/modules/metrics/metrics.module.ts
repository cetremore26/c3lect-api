import { Module } from '@nestjs/common';
import { MetricsController } from './infrastructure/http/metrics.controller';
import { MetricsService } from './infrastructure/read-model/metrics.queries';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
