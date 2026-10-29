import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '../../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../../shared/application/ports/event-bus.port';
import { NotificationsService } from '../../application/notifications.service';
import {
  CodigoDeAccesoSolicitado,
  RestablecimientoDeClaveSolicitado,
  UsuarioRegistrado,
} from '../../../auth/public-api';
import {
  EstadoDePedidoCambiado,
  PedidoCreado,
} from '../../../orders/public-api';
import { PagoAprobado, PagoSinPedido } from '../../../payments/public-api';

// Todos `after-commit`: un correo nunca debe salir por una operación que
// terminó en rollback, y nunca debe frenar ni tumbar la respuesta.
@Injectable()
export class NotificationsSubscribers implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.events.subscribe(
      PedidoCreado,
      ({ pedido }) => this.notifications.pedidoCreado(pedido),
      'after-commit',
    );
    this.events.subscribe(
      EstadoDePedidoCambiado,
      ({ cambio }) => this.notifications.estadoDePedidoCambiado(cambio),
      'after-commit',
    );
    this.events.subscribe(
      PagoAprobado,
      ({ pago }) => this.notifications.pagoAprobado(pago),
      'after-commit',
    );
    this.events.subscribe(
      PagoSinPedido,
      ({ incidente }) => this.notifications.pagoSinPedido(incidente),
      'after-commit',
    );
    this.events.subscribe(
      UsuarioRegistrado,
      ({ usuario }) => this.notifications.bienvenida(usuario),
      'after-commit',
    );
    this.events.subscribe(
      CodigoDeAccesoSolicitado,
      ({ solicitud }) => this.notifications.codigoDeAcceso(solicitud),
      'after-commit',
    );
    this.events.subscribe(
      RestablecimientoDeClaveSolicitado,
      ({ solicitud }) => this.notifications.restablecimientoDeClave(solicitud),
      'after-commit',
    );
  }
}
