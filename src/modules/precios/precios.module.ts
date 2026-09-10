import { Module } from '@nestjs/common';
import { PreciosController } from './precios.controller';
import { PreciosService } from './precios.service';
import { PreciosRepository } from './precios.repository';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [PreciosController],
  providers: [PreciosService, PreciosRepository],
})
export class PreciosModule {}
