import { Inject, Injectable } from '@nestjs/common';
import { COSTO_ADICIONAL_DEFAULT } from '../domain/precios.util';
import { PRECIOS_REPOSITORY } from './ports/precios-repository.port';
import type { PreciosRepositoryPort } from './ports/precios-repository.port';

interface CompraRef {
  marca: string | null;
  modelo: string;
  costoUnitario: number;
}

// Cómo la tabla de precios sigue a compras e inventario. Antes estas
// escrituras sobre calculo_precios vivían en los repositorios de compras e
// inventario. Nunca se pisan los precios fijados a mano (público / cierre).
@Injectable()
export class CostosSyncService {
  constructor(
    @Inject(PRECIOS_REPOSITORY)
    private readonly precios: PreciosRepositoryPort,
  ) {}

  /** Primera compra de un modelo: nace su fila con el costo. Las siguientes no la tocan. */
  async compraRegistrada(compra: CompraRef): Promise<void> {
    if (await this.precios.findByModelo(compra.modelo)) return;
    await this.precios.create(this.filaNueva(compra));
  }

  /** Compra corregida: actualiza solo el costo (y la identidad si cambió). */
  async compraCorregida(c: {
    anterior: { modelo: string };
    nueva: CompraRef;
    modeloCambio: boolean;
    actualizarPrecio: boolean;
  }): Promise<void> {
    if (!c.actualizarPrecio) return;

    const existente = await this.precios.findByModelo(
      c.modeloCambio ? c.anterior.modelo : c.nueva.modelo,
    );
    if (existente) {
      await this.precios.update(existente.id, {
        marca: c.nueva.marca,
        modelo: c.nueva.modelo,
        costoUnitario: c.nueva.costoUnitario,
        costoTotal: c.nueva.costoUnitario + existente.costoAdicional,
      });
    } else {
      await this.precios.create(this.filaNueva(c.nueva));
    }
  }

  async inventarioRecalculado(r: {
    modelosActivos: string[];
    filas: { marca: string | null; modelo: string; costoUnitario: number }[];
  }): Promise<void> {
    await this.precios.borrarHuerfanosSinPrecioManual(r.modelosActivos);
    for (const fila of r.filas) {
      await this.precios.upsertPorModelo(
        fila.modelo,
        {
          marca: fila.marca,
          costoUnitario: fila.costoUnitario,
          costoTotal: fila.costoUnitario + COSTO_ADICIONAL_DEFAULT,
        },
        this.filaNueva(fila),
      );
    }
  }

  private filaNueva(compra: CompraRef) {
    return {
      marca: compra.marca,
      modelo: compra.modelo,
      costoUnitario: compra.costoUnitario,
      costoAdicional: COSTO_ADICIONAL_DEFAULT,
      costoTotal: compra.costoUnitario + COSTO_ADICIONAL_DEFAULT,
    };
  }
}
