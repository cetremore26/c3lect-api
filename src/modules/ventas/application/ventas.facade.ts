import { Inject, Injectable } from '@nestjs/common';
import { VENTAS_REPOSITORY } from './ports/ventas-repository.port';
import type { VentasRepositoryPort } from './ports/ventas-repository.port';

// API pública del contexto de ventas (se expone en public-api.ts).
@Injectable()
export class VentasFacade {
  constructor(
    @Inject(VENTAS_REPOSITORY)
    private readonly ventasRepository: VentasRepositoryPort,
  ) {}

  /** Una entrada por cada venta registrada (para recalcular inventario). */
  modelosVendidos(): Promise<{ modelo: string }[]> {
    return this.ventasRepository.modelosVendidos();
  }
}
