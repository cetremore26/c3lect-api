import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { deriveMarcaModeloFromProduct } from '../../../../common/marca-modelo.util';
import { PromotionsService } from '../../../promotions/promotions.service';
import {
  PricedOrder,
  RequestedItem,
  priceOrderItems,
} from '../../domain/order-pricing';
import { INVENTORY_LOOKUP } from '../ports/inventory-lookup.port';
import type { InventoryLookupPort } from '../ports/inventory-lookup.port';
import { ORDER_PRODUCT_CATALOG } from '../ports/order-product-catalog.port';
import type { OrderProductCatalogPort } from '../ports/order-product-catalog.port';

@Injectable()
export class ResolveOrderItemsUseCase {
  constructor(
    @Inject(ORDER_PRODUCT_CATALOG)
    private readonly catalog: OrderProductCatalogPort,
    @Inject(INVENTORY_LOOKUP)
    private readonly inventory: InventoryLookupPort,
    private readonly promotions: PromotionsService,
  ) {}

  // Resuelve precios server-side (nunca confía en lo que envía el cliente) y
  // hace una verificación best-effort de stock. El guard autoritativo sigue
  // siendo el de OrderRepositoryPort.transitionStatus/createConfirmed, que
  // vuelve a revisar el stock justo antes de confirmar/materializar el
  // pedido. `autenticado` determina si aplican promociones con
  // soloCuentaActiva=true (ver modules/promotions).
  async execute(
    items: RequestedItem[],
    autenticado = false,
  ): Promise<PricedOrder> {
    const productIds = items.map((i) => i.productId);
    const products = await this.catalog.findAvailableByIds(productIds);

    const missing = productIds.filter((id) => !products.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Producto(s) no disponible(s): ${missing.join(', ')}`,
      );
    }

    const promocionesVigentes = await this.promotions.getPromocionesVigentes();
    const priced = priceOrderItems(
      items,
      products,
      promocionesVigentes,
      autenticado,
    );

    for (const item of priced.itemsData) {
      const product = products.get(item.productId)!;
      const { modelo } = deriveMarcaModeloFromProduct(product);
      const inv = await this.inventory.findByModelo(modelo, product.nombre);
      if (inv && inv.stock < item.cantidad) {
        throw new BadRequestException(
          `Stock insuficiente para "${item.nombre}" (disponible: ${inv.stock}, solicitado: ${item.cantidad}).`,
        );
      }
    }

    return priced;
  }
}
