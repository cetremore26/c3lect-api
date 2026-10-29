import { Injectable } from '@nestjs/common';
import type {
  CompraHistorica,
  HistorialComprasPort,
  HistorialVentasPort,
} from '../../application/ports/historial.port';
import { ComprasFacade } from '../../../compras/public-api';
import { VentasFacade } from '../../../ventas/public-api';

@Injectable()
export class ComprasFacadeHistorial implements HistorialComprasPort {
  constructor(private readonly compras: ComprasFacade) {}

  listar(): Promise<CompraHistorica[]> {
    return this.compras.listarParaInventario();
  }
}

@Injectable()
export class VentasFacadeHistorial implements HistorialVentasPort {
  constructor(private readonly ventas: VentasFacade) {}

  modelosVendidos(): Promise<{ modelo: string }[]> {
    return this.ventas.modelosVendidos();
  }
}
