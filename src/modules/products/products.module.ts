import { Module } from '@nestjs/common';
import { CatalogSyncService } from './application/catalog-sync.service';
import { CatalogFacade } from './application/catalog.facade';
import { PRODUCTS_REPOSITORY } from './application/ports/products-repository.port';
import { ProductsService } from './application/products.service';
import { CatalogEventSubscribers } from './infrastructure/events/catalog-event.subscribers';
import { ProductsController } from './infrastructure/http/products.controller';
import { ProductsRepository } from './infrastructure/persistence/products.repository';

@Module({
  controllers: [ProductsController],
  providers: [
    ProductsService,
    CatalogSyncService,
    CatalogFacade,
    CatalogEventSubscribers,
    { provide: PRODUCTS_REPOSITORY, useClass: ProductsRepository },
  ],
  exports: [CatalogFacade],
})
export class ProductsModule {}
