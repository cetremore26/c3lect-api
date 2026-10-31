import { Injectable } from '@nestjs/common';
import type { CatalogPricePort } from '../../application/ports/catalog-price.port';
import { CatalogFacade } from '../../../products/public-api';

@Injectable()
export class CatalogPriceAdapter implements CatalogPricePort {
  constructor(private readonly catalog: CatalogFacade) {}

  actualizarPrecioPublico(nombreCompleto: string, precio: number) {
    return this.catalog.actualizarPrecioPublico(nombreCompleto, precio);
  }
}
