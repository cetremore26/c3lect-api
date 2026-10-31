import { Inject, Injectable } from '@nestjs/common';
import { INVENTARIO_REPOSITORY } from './ports/inventario-repository.port';
import type {
  InventarioItem,
  InventarioRepositoryPort,
} from './ports/inventario-repository.port';

// API pública del contexto de inventario (se expone en public-api.ts). Solo
// consultas: el stock solo cambia por los eventos a los que inventario
// reacciona.
@Injectable()
export class InventarioFacade {
  constructor(
    @Inject(INVENTARIO_REPOSITORY)
    private readonly inventario: InventarioRepositoryPort,
  ) {}

  buscarPorModelo(
    modelo: string,
    nombreCompletoLegado: string,
  ): Promise<InventarioItem | null> {
    return this.inventario.buscarPorModelo(modelo, nombreCompletoLegado);
  }
}
