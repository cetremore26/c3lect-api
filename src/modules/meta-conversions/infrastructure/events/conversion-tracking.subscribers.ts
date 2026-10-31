import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '../../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../../shared/application/ports/event-bus.port';
import { ConversionTrackingService } from '../../application/conversion-tracking.service';
import { PedidoCreado } from '../../../orders/public-api';
import { PagoAprobado } from '../../../payments/public-api';
import { VentaManualRegistrada } from '../../../ventas/public-api';

@Injectable()
export class ConversionTrackingSubscribers implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly tracking: ConversionTrackingService,
  ) {}

  onModuleInit() {
    this.events.subscribe(
      PedidoCreado,
      ({ pedido }) =>
        this.tracking.compraWeb({
          orderNumber: pedido.orderNumber,
          total: pedido.total,
          productIds: pedido.lineas.map((l) => l.productId),
          cliente: pedido.cliente,
          fbp: pedido.fbp,
          fbc: pedido.fbc,
        }),
      'after-commit',
    );
    this.events.subscribe(
      PagoAprobado,
      ({ pago }) =>
        this.tracking.compraWeb({
          orderNumber: pago.orderNumber,
          total: pago.total,
          productIds: pago.lineas.map((l) => l.productId),
          cliente: pago.cliente,
          fbp: pago.fbp,
          fbc: pago.fbc,
        }),
      'after-commit',
    );
    this.events.subscribe(
      VentaManualRegistrada,
      ({ venta }) => this.tracking.ventaOffline(venta),
      'after-commit',
    );
  }
}
