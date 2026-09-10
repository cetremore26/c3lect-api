import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OrderProductCatalogPort } from '../application/ports/order-product-catalog.port';
import { PriceableProduct } from '../domain/order-pricing';

@Injectable()
export class PrismaProductCatalogRepository implements OrderProductCatalogPort {
  constructor(private readonly prisma: PrismaService) {}

  async findAvailableByIds(
    ids: string[],
  ): Promise<Map<string, PriceableProduct>> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, disponible: true },
    });
    return new Map(products.map((p) => [p.id, p]));
  }
}
