import { Module } from '@nestjs/common';
import { ComprasModule } from '../compras/compras.module';
import { VentasModule } from '../ventas/ventas.module';
import { InventarioFacade } from './application/inventario.facade';
import { InventarioService } from './application/inventario.service';
import { MovimientosService } from './application/movimientos.service';
import {
  HISTORIAL_COMPRAS,
  HISTORIAL_VENTAS,
} from './application/ports/historial.port';
import { INVENTARIO_REPOSITORY } from './application/ports/inventario-repository.port';
import {
  ComprasFacadeHistorial,
  VentasFacadeHistorial,
} from './infrastructure/adapters/historial.adapters';
import { InventarioEventSubscribers } from './infrastructure/events/inventario-event.subscribers';
import { InventarioController } from './infrastructure/http/inventario.controller';
import { InventarioRepository } from './infrastructure/persistence/inventario.repository';

@Module({
  imports: [ComprasModule, VentasModule],
  controllers: [InventarioController],
  providers: [
    InventarioService,
    MovimientosService,
    InventarioFacade,
    InventarioEventSubscribers,
    { provide: INVENTARIO_REPOSITORY, useClass: InventarioRepository },
    { provide: HISTORIAL_COMPRAS, useClass: ComprasFacadeHistorial },
    { provide: HISTORIAL_VENTAS, useClass: VentasFacadeHistorial },
  ],
  exports: [InventarioFacade],
})
export class InventarioModule {}
