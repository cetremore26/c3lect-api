import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { InventarioRepository, SeedRow } from './inventario.repository';
import {
  agruparComprasPorModelo,
  calcularStock,
  capitalItem,
  contarVentasPorModelo,
} from './inventario.util';

const COSTO_ADICIONAL_DEFAULT = 25028;

@Injectable()
export class InventarioService {
  constructor(
    private readonly inventarioRepository: InventarioRepository,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    const items = await this.inventarioRepository.findAll();
    return items.map((i) => ({
      ...i,
      capitalItem: capitalItem(i.stock, i.costoUnitario),
    }));
  }

  stockPublico() {
    return this.inventarioRepository.findStockPublico();
  }

  async seed(userId?: string) {
    const [compras, ventas] = await Promise.all([
      this.inventarioRepository.findComprasParaSeed(),
      this.inventarioRepository.findVentasParaSeed(),
    ]);

    const porModelo = agruparComprasPorModelo(compras);
    const ventasPorModelo = contarVentasPorModelo(ventas);
    const modelosActivos = Object.keys(porModelo);

    const filas: SeedRow[] = modelosActivos.map((modelo) => {
      const datos = porModelo[modelo];
      const vendidos = ventasPorModelo[modelo] ?? 0;
      return {
        modelo,
        marca: datos.marca,
        stock: calcularStock(datos.cantidad, vendidos),
        costoUnitario: datos.costoUnitario,
        categoria: datos.categoria,
        costoTotal: datos.costoUnitario + COSTO_ADICIONAL_DEFAULT,
        costoAdicional: COSTO_ADICIONAL_DEFAULT,
      };
    });

    const upsertados = await this.inventarioRepository.applySeed(
      modelosActivos,
      filas,
    );

    await this.audit.log(
      'RECALCULAR',
      'inventario',
      'seed',
      `Inventario recalculado desde compras/ventas históricas: ${upsertados} modelo(s)`,
      userId,
    );

    return { seeded: upsertados, modelos: modelosActivos };
  }
}
