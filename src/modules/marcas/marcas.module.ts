import { Module } from '@nestjs/common';
import { ComprasFacade } from '../compras/public-api';
import { ComprasModule } from '../compras/compras.module';
import { CatalogFacade } from '../products/public-api';
import { ProductsModule } from '../products/products.module';
import { MarcasService } from './application/marcas.service';
import { FUENTES_DE_MARCAS } from './application/ports/fuentes-de-marcas.port';
import { MarcasController } from './infrastructure/http/marcas.controller';

@Module({
  imports: [ProductsModule, ComprasModule],
  controllers: [MarcasController],
  providers: [
    MarcasService,
    // Ambas fachadas ya cumplen FuenteDeMarcasPort ({ marcas() }), así que
    // no hace falta un adaptador propio.
    {
      provide: FUENTES_DE_MARCAS,
      useFactory: (catalog: CatalogFacade, compras: ComprasFacade) => [
        catalog,
        compras,
      ],
      inject: [CatalogFacade, ComprasFacade],
    },
  ],
})
export class MarcasModule {}
