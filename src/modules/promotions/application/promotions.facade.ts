import { Inject, Injectable } from '@nestjs/common';
import {
  calcularPrecioFinal,
  mejorDescuento,
  ProductoLike,
} from '../domain/promotions.util';
import { PROMOTIONS_REPOSITORY } from './ports/promotions-repository.port';
import type { PromotionsRepositoryPort } from './ports/promotions-repository.port';

// API pública de promociones (se expone en public-api.ts): cotiza el precio
// final de cada producto con la mejor promoción vigente que le aplique. Es
// la que usa orders para fijar precios server-side, sin conocer las reglas.
@Injectable()
export class PromotionsFacade {
  constructor(
    @Inject(PROMOTIONS_REPOSITORY)
    private readonly promotionsRepository: PromotionsRepositoryPort,
  ) {}

  async preciosFinales(
    products: (ProductoLike & { precio: number })[],
    autenticado: boolean,
  ): Promise<Map<string, number>> {
    const vigentes = await this.promotionsRepository.findVigentes(new Date());
    return new Map(
      products.map((p) => [
        p.id,
        calcularPrecioFinal(p.precio, mejorDescuento(vigentes, p, autenticado)),
      ]),
    );
  }
}
