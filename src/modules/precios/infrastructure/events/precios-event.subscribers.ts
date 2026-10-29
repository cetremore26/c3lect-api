import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '../../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../../shared/application/ports/event-bus.port';
import { CostosSyncService } from '../../application/costos-sync.service';
import { CompraCorregida, CompraRegistrada } from '../../../compras/public-api';
import { InventarioRecalculado } from '../../../inventario/public-api';

@Injectable()
export class PreciosEventSubscribers implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly costos: CostosSyncService,
  ) {}

  onModuleInit() {
    this.events.subscribe(
      CompraRegistrada,
      ({ compra }) => this.costos.compraRegistrada(compra),
      'in-transaction',
    );
    this.events.subscribe(
      CompraCorregida,
      ({ correccion }) => this.costos.compraCorregida(correccion),
      'in-transaction',
    );
    this.events.subscribe(
      InventarioRecalculado,
      ({ recalculo }) => this.costos.inventarioRecalculado(recalculo),
      'in-transaction',
    );
  }
}
