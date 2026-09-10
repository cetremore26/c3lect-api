import { Module } from '@nestjs/common';
import { GastosController } from './gastos.controller';
import { GastosService } from './gastos.service';
import { GastosRepository } from './gastos.repository';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [GastosController],
  providers: [GastosService, GastosRepository],
})
export class GastosModule {}
