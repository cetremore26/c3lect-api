import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG } from '../../../shared/application/ports/audit-log.port';
import type { AuditLogPort } from '../../../shared/application/ports/audit-log.port';
import { EVENT_BUS } from '../../../shared/application/ports/event-bus.port';
import type { EventBusPort } from '../../../shared/application/ports/event-bus.port';
import { UNIT_OF_WORK } from '../../../shared/application/ports/unit-of-work.port';
import type { UnitOfWorkPort } from '../../../shared/application/ports/unit-of-work.port';
import { InventarioRecalculado } from '../domain/inventario-events';
import {
  agruparComprasPorModelo,
  calcularStock,
  capitalItem,
  contarVentasPorModelo,
} from '../domain/inventario.util';
import { HISTORIAL_COMPRAS, HISTORIAL_VENTAS } from './ports/historial.port';
import type {
  HistorialComprasPort,
  HistorialVentasPort,
} from './ports/historial.port';
import { INVENTARIO_REPOSITORY } from './ports/inventario-repository.port';
import type {
  InventarioRepositoryPort,
  SeedRow,
} from './ports/inventario-repository.port';

@Injectable()
export class InventarioService {
  constructor(
    @Inject(INVENTARIO_REPOSITORY)
    private readonly inventarioRepository: InventarioRepositoryPort,
    @Inject(HISTORIAL_COMPRAS) private readonly compras: HistorialComprasPort,
    @Inject(HISTORIAL_VENTAS) private readonly ventas: HistorialVentasPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
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
      this.compras.listar(),
      this.ventas.modelosVendidos(),
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
      };
    });

    // Inventario y la tabla de precios deben quedar sincronizados: el upsert
    // de inventario y la reacción de precios a InventarioRecalculado corren
    // en una sola transacción.
    const upsertados = await this.uow.run(
      async () => {
        const count = await this.inventarioRepository.applySeed(
          modelosActivos,
          filas,
        );
        await this.events.publish(
          new InventarioRecalculado({
            modelosActivos,
            filas: filas.map((f) => ({
              marca: f.marca,
              modelo: f.modelo,
              costoUnitario: f.costoUnitario,
            })),
          }),
        );
        return count;
      },
      { timeout: 15000 },
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
