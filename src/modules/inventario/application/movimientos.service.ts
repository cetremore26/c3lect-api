import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../shared/application/ports/event-bus.port';
import { BusinessRuleViolation } from '../../../shared/domain/domain-error';
import { combineMarcaModelo } from '../../../shared/domain/marca-modelo.util';
import {
  MercanciaIngresada,
  ModeloRef,
  SalidaPorPedidoRegistrada,
  StockAgotado,
  StockRepuesto,
} from '../domain/inventario-events';
import { INVENTARIO_REPOSITORY } from './ports/inventario-repository.port';
import type {
  IngresoData,
  InventarioRepositoryPort,
} from './ports/inventario-repository.port';

export interface LineaASacar extends ModeloRef {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

// Movimientos de stock que disparan otros contextos (pedidos, ventas
// manuales, compras). Antes cada uno de esos módulos escribía directamente en
// inventario_maestro; ahora reaccionan con un evento y esta es la única pieza
// que mueve stock. Todo corre dentro de la unidad de trabajo del publicador,
// así que lanzar aquí revierte la operación original.
@Injectable()
export class MovimientosService {
  constructor(
    @Inject(INVENTARIO_REPOSITORY)
    private readonly inventario: InventarioRepositoryPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  async salidaPorPedido(pedido: {
    orderId: string;
    cliente: string;
    celular: string | null;
    lineas: LineaASacar[];
  }): Promise<void> {
    const despachadas: SalidaPorPedidoRegistrada['salida']['lineas'] = [];

    for (const linea of pedido.lineas) {
      const item = await this.inventario.buscarPorModelo(
        linea.modelo,
        linea.nombre,
      );
      if (!item) continue; // producto no rastreado en inventario maestro

      const restante = await this.inventario.descontar(item.id, linea.cantidad);
      if (restante === null) {
        throw new BusinessRuleViolation(
          `Stock insuficiente para "${linea.nombre}" (disponible: ${item.stock}, solicitado: ${linea.cantidad}).`,
        );
      }
      if (restante <= 0) {
        await this.events.publish(
          new StockAgotado({
            marca: linea.marca,
            modelo: linea.modelo,
            nombreProducto: linea.nombre,
          }),
        );
      }

      despachadas.push({
        marca: linea.marca,
        modelo: linea.modelo,
        cantidad: linea.cantidad,
        precioUnitario: linea.precioUnitario,
        costoUnitario: item.costoUnitario,
      });
    }

    if (despachadas.length > 0) {
      await this.events.publish(
        new SalidaPorPedidoRegistrada({
          orderId: pedido.orderId,
          cliente: pedido.cliente,
          celular: pedido.celular,
          lineas: despachadas,
        }),
      );
    }
  }

  async revertirSalidaPorPedido(lineas: LineaASacar[]): Promise<void> {
    for (const linea of lineas) {
      const item = await this.inventario.buscarPorModelo(
        linea.modelo,
        linea.nombre,
      );
      if (!item) continue;

      const stock = await this.inventario.incrementar(item.id, linea.cantidad);
      if (stock > 0) {
        await this.events.publish(
          new StockRepuesto({
            marca: linea.marca,
            modelo: linea.modelo,
            nombreProducto: linea.nombre,
          }),
        );
      }
    }
  }

  /** Venta manual registrada en el panel: sale 1 unidad del modelo. */
  async salidaPorVentaManual(ref: ModeloRef): Promise<void> {
    const item = await this.inventario.buscarPorModelo(ref.modelo, ref.modelo);
    if (!item) return; // modelo no rastreado: no se toca stock

    const restante = await this.inventario.descontar(item.id, 1);
    if (restante === null) {
      throw new BusinessRuleViolation(
        `Stock insuficiente para "${combineMarcaModelo(ref.marca, ref.modelo)}".`,
      );
    }
    if (restante <= 0) {
      await this.events.publish(
        new StockAgotado({ ...ref, nombreProducto: null }),
      );
    }
  }

  /** Se borró una venta manual: vuelve la unidad. */
  async revertirVentaManual(ref: ModeloRef): Promise<void> {
    await this.inventario.ajustarStockPorModelo(ref.modelo, 1);
    const item = await this.inventario.findByModelo(ref.modelo);
    if (item && item.stock > 0) {
      await this.events.publish(
        new StockRepuesto({ ...ref, nombreProducto: null }),
      );
    }
  }

  async ingresoPorCompra(compra: IngresoData): Promise<void> {
    await this.inventario.registrarIngreso(compra);
    await this.publicarIngreso(compra, null);
  }

  async correccionDeCompra(c: {
    anterior: ModeloRef & { cantidad: number };
    nueva: IngresoData;
    modeloCambio: boolean;
    identidadCambio: boolean;
  }): Promise<void> {
    if (c.modeloCambio) {
      await this.inventario.ajustarStockPorModelo(
        c.anterior.modelo,
        -c.anterior.cantidad,
      );
      await this.inventario.registrarIngreso(c.nueva);
    } else {
      await this.inventario.corregirPorModelo(c.nueva.modelo, {
        marca: c.nueva.marca,
        deltaStock: c.nueva.cantidad - c.anterior.cantidad,
        costoUnitario: c.nueva.costoUnitario,
        categoria: c.nueva.categoria,
      });
    }

    await this.publicarIngreso(
      c.nueva,
      c.identidadCambio
        ? { marca: c.anterior.marca, modelo: c.anterior.modelo }
        : null,
    );
  }

  private async publicarIngreso(
    data: IngresoData,
    renombradoDesde: ModeloRef | null,
  ): Promise<void> {
    const item = await this.inventario.findByModelo(data.modelo);
    await this.events.publish(
      new MercanciaIngresada({
        marca: data.marca,
        modelo: data.modelo,
        categoria: data.categoria,
        stock: item?.stock ?? null,
        renombradoDesde,
      }),
    );
  }
}
