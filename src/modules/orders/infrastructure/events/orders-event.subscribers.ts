import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '../../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../../shared/application/ports/event-bus.port';
import { LinkGuestOrdersUseCase } from '../../application/use-cases/link-guest-orders.use-case';
import { UsuarioRegistrado } from '../../../auth/public-api';

// Adaptador de entrada: traduce eventos de otros contextos a casos de uso de
// orders, igual que un controller traduce requests HTTP.
@Injectable()
export class OrdersEventSubscribers implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly linkGuestOrders: LinkGuestOrdersUseCase,
  ) {}

  onModuleInit() {
    // Los pedidos hechos como invitado con el mismo email pasan a la cuenta
    // nueva. Era un updateMany sobre `orders` dentro de AuthService.
    this.events.subscribe(
      UsuarioRegistrado,
      (e) => this.linkGuestOrders.execute(e.usuario.email, e.usuario.userId),
      'in-transaction',
    );
  }
}
