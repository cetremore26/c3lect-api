import { Inject, Injectable } from '@nestjs/common';
import { COMPRAS_REPOSITORY } from './ports/compras-repository.port';
import type { ComprasRepositoryPort } from './ports/compras-repository.port';

// API pública del contexto de compras (se expone en public-api.ts).
@Injectable()
export class ComprasFacade {
  constructor(
    @Inject(COMPRAS_REPOSITORY)
    private readonly comprasRepository: ComprasRepositoryPort,
  ) {}

  /** Todas las compras, para recalcular inventario desde el histórico. */
  listarParaInventario() {
    return this.comprasRepository.findAllParaInventario();
  }

  marcas(): Promise<string[]> {
    return this.comprasRepository.findMarcas();
  }
}
