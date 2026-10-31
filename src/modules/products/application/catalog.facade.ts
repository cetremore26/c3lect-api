import { Inject, Injectable } from '@nestjs/common';
import type { Product } from '../domain/product';
import { PRODUCTS_REPOSITORY } from './ports/products-repository.port';
import type { ProductsRepositoryPort } from './ports/products-repository.port';

// API pública del catálogo para otros módulos (se expone en public-api.ts).
@Injectable()
export class CatalogFacade {
  constructor(
    @Inject(PRODUCTS_REPOSITORY)
    private readonly products: ProductsRepositoryPort,
  ) {}

  findByIds(
    ids: string[],
    { soloDisponibles }: { soloDisponibles: boolean },
  ): Promise<Product[]> {
    return this.products.findByIds(ids, soloDisponibles);
  }

  /**
   * El precio público de la tabla de precios es el que se muestra y cobra en
   * la tienda: se propaga a todas las variantes con ese nombre.
   */
  actualizarPrecioPublico(nombreCompleto: string, precio: number) {
    return this.products.setPrecioPorNombre(nombreCompleto, precio);
  }

  marcas(): Promise<string[]> {
    return this.products.findMarcas();
  }
}
