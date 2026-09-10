import { Module } from '@nestjs/common';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';
import { InventarioRepository } from './inventario.repository';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [InventarioController],
  providers: [InventarioService, InventarioRepository],
})
export class InventarioModule {}
