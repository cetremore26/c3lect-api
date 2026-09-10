import { Module } from '@nestjs/common';
import { VentasController } from './ventas.controller';
import { VentasService } from './ventas.service';
import { VentasRepository } from './ventas.repository';
import { AuditModule } from '../audit/audit.module';
import { MetaConversionsModule } from '../meta-conversions/meta-conversions.module';

@Module({
  imports: [AuditModule, MetaConversionsModule],
  controllers: [VentasController],
  providers: [VentasService, VentasRepository],
})
export class VentasModule {}
