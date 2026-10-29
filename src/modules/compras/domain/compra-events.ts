import type { DomainEvent } from '../../../shared/domain/domain-event';

// Hechos que publica compras. Inventario suma el stock, precios crea o
// actualiza el costo y el catálogo habilita el producto — cada uno en sus
// propias tablas, dentro de la transacción de la compra.

export interface CompraData {
  marca: string | null;
  modelo: string;
  cantidad: number;
  costoUnitario: number;
  categoria: string;
}

export class CompraRegistrada implements DomainEvent {
  static readonly NAME = 'compras.compra-registrada';
  readonly name = CompraRegistrada.NAME;

  constructor(readonly compra: CompraData & { compraId: string }) {}
}

export class CompraCorregida implements DomainEvent {
  static readonly NAME = 'compras.compra-corregida';
  readonly name = CompraCorregida.NAME;

  constructor(
    readonly correccion: {
      compraId: string;
      anterior: { marca: string | null; modelo: string; cantidad: number };
      nueva: CompraData;
      /** El modelo cambió: el stock pasa de un modelo a otro. */
      modeloCambio: boolean;
      /** Cambió marca y/o modelo: el producto del catálogo se renombra. */
      identidadCambio: boolean;
      /** Cambió el costo o el modelo: hay que tocar la tabla de precios. */
      actualizarPrecio: boolean;
    },
  ) {}
}
