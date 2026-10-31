import { PriceableProduct } from '../../domain/order-pricing';

export const ORDER_PRODUCT_CATALOG = Symbol('ORDER_PRODUCT_CATALOG');

// Vista de solo lectura del catálogo, tal como la necesita el módulo de
// pedidos. La implementa un adaptador sobre la API pública de products.
export interface OrderProductCatalogPort {
  /** Solo productos disponibles para la venta (para cotizar un pedido nuevo). */
  findAvailableByIds(ids: string[]): Promise<Map<string, PriceableProduct>>;
  /** Cualquier producto, disponible o no (para resolver marca/modelo al confirmar). */
  findByIds(ids: string[]): Promise<Map<string, PriceableProduct>>;
}
