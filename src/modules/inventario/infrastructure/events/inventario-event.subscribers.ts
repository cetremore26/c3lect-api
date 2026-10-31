import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '../../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../../shared/application/ports/event-bus.port';
import { MovimientosService } from '../../application/movimientos.service';
import { CompraCorregida, CompraRegistrada } from '../../../compras/public-api';
import {
  ConfirmacionDePedidoRevertida,
  PedidoConfirmado,
} from '../../../orders/public-api';
import {
  VentaEliminada,
  VentaManualRegistrada,
} from '../../../ventas/public-api';

// Adaptador de entrada: hechos de pedidos, ventas y compras → movimientos de
// stock. Todos `in-transaction`: si inventario rechaza (stock insuficiente),
// la operación que los originó se revierte.
@Injectable()
export class InventarioEventSubscribers implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly movimientos: MovimientosService,
  ) {}

  onModuleInit() {
    this.events.subscribe(
      PedidoConfirmado,
      ({ pedido }) => this.movimientos.salidaPorPedido(pedido),
      'in-transaction',
    );
    this.events.subscribe(
      ConfirmacionDePedidoRevertida,
      ({ pedido }) => this.movimientos.revertirSalidaPorPedido(pedido.lineas),
      'in-transaction',
    );
    this.events.subscribe(
      VentaManualRegistrada,
      ({ venta }) =>
        this.movimientos.salidaPorVentaManual({
          marca: venta.marca,
          modelo: venta.modelo,
        }),
      'in-transaction',
    );
    this.events.subscribe(
      VentaEliminada,
      ({ venta }) =>
        this.movimientos.revertirVentaManual({
          marca: venta.marca,
          modelo: venta.modelo,
        }),
      'in-transaction',
    );
    this.events.subscribe(
      CompraRegistrada,
      ({ compra }) => this.movimientos.ingresoPorCompra(compra),
      'in-transaction',
    );
    this.events.subscribe(
      CompraCorregida,
      ({ correccion }) => this.movimientos.correccionDeCompra(correccion),
      'in-transaction',
    );
  }
}
