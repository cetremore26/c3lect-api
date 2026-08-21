import { Module } from '@nestjs/common';
import { VentasController } from './ventas.controller';
import { VentasService } from './ventas.service';
import { AuditModule } from '../audit/audit.module';
import { MetaConversionsModule } from '../meta-conversions/meta-conversions.module';

@Module({
  imports: [AuditModule, MetaConversionsModule],
  controllers: [VentasController],
  providers: [VentasService],
})
export class VentasModule {}
