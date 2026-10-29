import { deriveMarcaModeloFromProduct } from '../../../shared/domain/marca-modelo.util';
import type { LineaInventariable } from '../domain/order-events';
import type { OrderProductCatalogPort } from './ports/order-product-catalog.port';

// Resuelve la identidad de inventario (marca/modelo) de cada línea a partir
// del producto del catálogo. Si el producto ya no existe, cae al
// comportamiento legado: el nombre completo como modelo, sin marca.
export async function toLineasInventariables(
  catalog: OrderProductCatalogPort,
  items: {
    productId: string;
    nombre: string;
    cantidad: number;
    precioUnitario: number;
  }[],
): Promise<LineaInventariable[]> {
  const products = await catalog.findByIds(items.map((i) => i.productId));
  return items.map((item) => {
    const product = products.get(item.productId);
    const { marca, modelo } = product
      ? deriveMarcaModeloFromProduct(product)
      : { marca: null, modelo: item.nombre };
    return {
      productId: item.productId,
      nombre: item.nombre,
      marca,
      modelo,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
    };
  });
}
