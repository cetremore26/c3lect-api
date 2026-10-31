import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '../../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../../shared/application/ports/event-bus.port';
import { CatalogSyncService } from '../../application/catalog-sync.service';
import {
  MercanciaIngresada,
  StockAgotado,
  StockRepuesto,
} from '../../../inventario/public-api';

// El catálogo refleja lo que pasa en inventario, dentro de la misma
// transacción del movimiento que lo causó.
@Injectable()
export class CatalogEventSubscribers implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly sync: CatalogSyncService,
  ) {}

  onModuleInit() {
    this.events.subscribe(
      StockAgotado,
      ({ ref }) => this.sync.agotar(ref),
      'in-transaction',
    );
    this.events.subscribe(
      StockRepuesto,
      ({ ref }) => this.sync.reponer(ref),
      'in-transaction',
    );
    this.events.subscribe(
      MercanciaIngresada,
      ({ ingreso }) => this.sync.sincronizarIngreso(ingreso),
      'in-transaction',
    );
  }
}
