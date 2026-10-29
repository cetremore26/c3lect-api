import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '../../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../../shared/application/ports/event-bus.port';
import { VentasDePedidoService } from '../../application/ventas-de-pedido.service';
import { SalidaPorPedidoRegistrada } from '../../../inventario/public-api';
import { ConfirmacionDePedidoRevertida } from '../../../orders/public-api';

@Injectable()
export class VentasEventSubscribers implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly ventasDePedido: VentasDePedidoService,
  ) {}

  onModuleInit() {
    // Inventario ya descontó el stock y resolvió el costo de cada unidad:
    // ventas solo registra. Las líneas sin inventario no generan venta.
    this.events.subscribe(
      SalidaPorPedidoRegistrada,
      ({ salida }) => this.ventasDePedido.registrar(salida),
      'in-transaction',
    );
    this.events.subscribe(
      ConfirmacionDePedidoRevertida,
      ({ pedido }) => this.ventasDePedido.anular(pedido.orderId),
      'in-transaction',
    );
  }
}
