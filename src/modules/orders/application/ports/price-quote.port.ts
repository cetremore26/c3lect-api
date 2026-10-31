import type { PriceableProduct } from '../../domain/order-pricing';

export const PRICE_QUOTE = Symbol('PRICE_QUOTE');

// Precio final de cada producto con las promociones vigentes aplicadas. Las
// reglas de descuento son del contexto promotions; orders solo pide la
// cotización.
export interface PriceQuotePort {
  preciosFinales(
    products: PriceableProduct[],
    autenticado: boolean,
  ): Promise<Map<string, number>>;
}
