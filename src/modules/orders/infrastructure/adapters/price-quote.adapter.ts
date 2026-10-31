import { Injectable } from '@nestjs/common';
import type { PriceQuotePort } from '../../application/ports/price-quote.port';
import type { PriceableProduct } from '../../domain/order-pricing';
import { PromotionsFacade } from '../../../promotions/public-api';

@Injectable()
export class PriceQuoteAdapter implements PriceQuotePort {
  constructor(private readonly promotions: PromotionsFacade) {}

  preciosFinales(
    products: PriceableProduct[],
    autenticado: boolean,
  ): Promise<Map<string, number>> {
    return this.promotions.preciosFinales(products, autenticado);
  }
}
