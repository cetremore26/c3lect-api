export const CATALOG_PRICE = Symbol('CATALOG_PRICE');

// El precio público de esta tabla es el que se cobra en la tienda, pero los
// productos son del catálogo: precios le pide al catálogo que lo aplique.
export interface CatalogPricePort {
  actualizarPrecioPublico(
    nombreCompleto: string,
    precio: number,
  ): Promise<void>;
}
