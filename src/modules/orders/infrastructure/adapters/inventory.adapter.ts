import { Injectable } from '@nestjs/common';
import type { InventoryLookupPort } from '../../application/ports/inventory-lookup.port';
import { InventarioFacade } from '../../../inventario/public-api';

@Injectable()
export class InventoryAdapter implements InventoryLookupPort {
  constructor(private readonly inventario: InventarioFacade) {}

  async stockDe(
    modelo: string,
    nombreCompletoLegado: string,
  ): Promise<number | null> {
    const item = await this.inventario.buscarPorModelo(
      modelo,
      nombreCompletoLegado,
    );
    return item?.stock ?? null;
  }
}
