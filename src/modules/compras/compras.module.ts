import { Module } from '@nestjs/common';
import { ComprasController } from './compras.controller';
import { ComprasService } from './compras.service';
import { ComprasRepository } from './compras.repository';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ComprasController],
  providers: [ComprasService, ComprasRepository],
})
export class ComprasModule {}
