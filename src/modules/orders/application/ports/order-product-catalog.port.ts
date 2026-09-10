import { PriceableProduct } from '../../domain/order-pricing';

export const ORDER_PRODUCT_CATALOG = Symbol('ORDER_PRODUCT_CATALOG');

// Vista de solo lectura del catálogo, tal como la necesita el módulo de
// pedidos para fijar precios server-side. No reemplaza a ProductsRepository
// (products/) ni se acopla a él — cada bounded context lee lo que necesita.
export interface OrderProductCatalogPort {
  findAvailableByIds(ids: string[]): Promise<Map<string, PriceableProduct>>;
}
