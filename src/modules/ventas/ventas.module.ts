import { Module } from '@nestjs/common';
import { VENTAS_REPOSITORY } from './application/ports/ventas-repository.port';
import { VentasDePedidoService } from './application/ventas-de-pedido.service';
import { VentasFacade } from './application/ventas.facade';
import { VentasService } from './application/ventas.service';
import { VentasEventSubscribers } from './infrastructure/events/ventas-event.subscribers';
import { VentasController } from './infrastructure/http/ventas.controller';
import { VentasRepository } from './infrastructure/persistence/ventas.repository';

@Module({
  controllers: [VentasController],
  providers: [
    VentasService,
    VentasDePedidoService,
    VentasFacade,
    VentasEventSubscribers,
    { provide: VENTAS_REPOSITORY, useClass: VentasRepository },
  ],
  exports: [VentasFacade],
})
export class VentasModule {}
