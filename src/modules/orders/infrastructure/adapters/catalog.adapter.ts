import { Injectable } from '@nestjs/common';
import type { OrderProductCatalogPort } from '../../application/ports/order-product-catalog.port';
import type { PriceableProduct } from '../../domain/order-pricing';
import { CatalogFacade } from '../../../products/public-api';

@Injectable()
export class CatalogAdapter implements OrderProductCatalogPort {
  constructor(private readonly catalog: CatalogFacade) {}

  findAvailableByIds(ids: string[]): Promise<Map<string, PriceableProduct>> {
    return this.toMap(this.catalog.findByIds(ids, { soloDisponibles: true }));
  }

  findByIds(ids: string[]): Promise<Map<string, PriceableProduct>> {
    return this.toMap(this.catalog.findByIds(ids, { soloDisponibles: false }));
  }

  private async toMap(
    pending: Promise<PriceableProduct[]>,
  ): Promise<Map<string, PriceableProduct>> {
    return new Map((await pending).map((p) => [p.id, p]));
  }
}
