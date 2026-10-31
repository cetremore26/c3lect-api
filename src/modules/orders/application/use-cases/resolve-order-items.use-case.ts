import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleViolation } from '../../../../shared/domain/domain-error';
import { deriveMarcaModeloFromProduct } from '../../../../shared/domain/marca-modelo.util';
import {
  PricedOrder,
  RequestedItem,
  priceOrderItems,
} from '../../domain/order-pricing';
import { INVENTORY_LOOKUP } from '../ports/inventory-lookup.port';
import type { InventoryLookupPort } from '../ports/inventory-lookup.port';
import { ORDER_PRODUCT_CATALOG } from '../ports/order-product-catalog.port';
import type { OrderProductCatalogPort } from '../ports/order-product-catalog.port';
import { PRICE_QUOTE } from '../ports/price-quote.port';
import type { PriceQuotePort } from '../ports/price-quote.port';

@Injectable()
export class ResolveOrderItemsUseCase {
  constructor(
    @Inject(ORDER_PRODUCT_CATALOG)
    private readonly catalog: OrderProductCatalogPort,
    @Inject(INVENTORY_LOOKUP)
    private readonly inventory: InventoryLookupPort,
    @Inject(PRICE_QUOTE) private readonly prices: PriceQuotePort,
  ) {}

  // Resuelve precios server-side (nunca confía en lo que envía el cliente) y
  // hace una verificación best-effort de stock. El guard autoritativo es el
  // de inventario al reaccionar a PedidoConfirmado, que vuelve a revisar el
  // stock dentro de la transacción de la confirmación. `autenticado`
  // determina si aplican promociones con soloCuentaActiva=true.
  async execute(
    items: RequestedItem[],
    autenticado = false,
  ): Promise<PricedOrder> {
    const productIds = items.map((i) => i.productId);
    const products = await this.catalog.findAvailableByIds(productIds);

    const missing = productIds.filter((id) => !products.has(id));
    if (missing.length > 0) {
      throw new BusinessRuleViolation(
        `Producto(s) no disponible(s): ${missing.join(', ')}`,
      );
    }

    const precios = await this.prices.preciosFinales(
      [...products.values()],
      autenticado,
    );
    const priced = priceOrderItems(items, products, precios);

    for (const item of priced.itemsData) {
      const product = products.get(item.productId)!;
      const { modelo } = deriveMarcaModeloFromProduct(product);
      const stock = await this.inventory.stockDe(modelo, product.nombre);
      if (stock !== null && stock < item.cantidad) {
        throw new BusinessRuleViolation(
          `Stock insuficiente para "${item.nombre}" (disponible: ${stock}, solicitado: ${item.cantidad}).`,
        );
      }
    }

    return priced;
  }
}
