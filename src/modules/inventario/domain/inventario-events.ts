import type { DomainEvent } from '../../../shared/domain/domain-event';

// Hechos que publica inventario. El catálogo los usa para habilitar o
// deshabilitar productos, precios para sincronizar costos y ventas para
// registrar las ventas de un pedido confirmado.

export interface ModeloRef {
  marca: string | null;
  modelo: string;
}

/** El stock de un modelo llegó a cero: sus productos ya no se pueden vender. */
export class StockAgotado implements DomainEvent {
  static readonly NAME = 'inventario.stock-agotado';
  readonly name = StockAgotado.NAME;

  /**
   * `nombreProducto` es el Product.nombre exacto cuando se conoce (flujo de
   * pedidos); si es null, el catálogo usa "marca modelo".
   */
  constructor(readonly ref: ModeloRef & { nombreProducto: string | null }) {}
}

/** Volvió a haber stock de un modelo. */
export class StockRepuesto implements DomainEvent {
  static readonly NAME = 'inventario.stock-repuesto';
  readonly name = StockRepuesto.NAME;

  constructor(readonly ref: ModeloRef & { nombreProducto: string | null }) {}
}

/** Entró (o se corrigió) mercancía de un modelo por una compra. */
export class MercanciaIngresada implements DomainEvent {
  static readonly NAME = 'inventario.mercancia-ingresada';
  readonly name = MercanciaIngresada.NAME;

  constructor(
    readonly ingreso: ModeloRef & {
      categoria: string;
      /** Stock resultante; null si el modelo no está en inventario. */
      stock: number | null;
      /** Si la compra corrigió marca/modelo, la identidad anterior. */
      renombradoDesde: ModeloRef | null;
    },
  ) {}
}

/** Salieron unidades por un pedido confirmado (solo modelos rastreados). */
export class SalidaPorPedidoRegistrada implements DomainEvent {
  static readonly NAME = 'inventario.salida-por-pedido';
  readonly name = SalidaPorPedidoRegistrada.NAME;

  constructor(
    readonly salida: {
      orderId: string;
      cliente: string;
      celular: string | null;
      lineas: (ModeloRef & {
        cantidad: number;
        precioUnitario: number;
        costoUnitario: number;
      })[];
    },
  ) {}
}

/** Se recalculó el inventario completo desde compras y ventas históricas. */
export class InventarioRecalculado implements DomainEvent {
  static readonly NAME = 'inventario.recalculado';
  readonly name = InventarioRecalculado.NAME;

  constructor(
    readonly recalculo: {
      modelosActivos: string[];
      /** Precios calcula su costo total a partir del costo unitario. */
      filas: (ModeloRef & { costoUnitario: number })[];
    },
  ) {}
}
