import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { CostosSyncService } from './application/costos-sync.service';
import { CATALOG_PRICE } from './application/ports/catalog-price.port';
import { PRECIOS_REPOSITORY } from './application/ports/precios-repository.port';
import { PreciosService } from './application/precios.service';
import { CatalogPriceAdapter } from './infrastructure/adapters/catalog-price.adapter';
import { PreciosEventSubscribers } from './infrastructure/events/precios-event.subscribers';
import { PreciosController } from './infrastructure/http/precios.controller';
import { PreciosRepository } from './infrastructure/persistence/precios.repository';

@Module({
  imports: [ProductsModule],
  controllers: [PreciosController],
  providers: [
    PreciosService,
    CostosSyncService,
    PreciosEventSubscribers,
    { provide: PRECIOS_REPOSITORY, useClass: PreciosRepository },
    { provide: CATALOG_PRICE, useClass: CatalogPriceAdapter },
  ],
})
export class PreciosModule {}
