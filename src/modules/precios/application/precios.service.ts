import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG } from '../../../shared/application/ports/audit-log.port';
import type { AuditLogPort } from '../../../shared/application/ports/audit-log.port';
import { NotFoundError } from '../../../shared/domain/domain-error';
import { combineMarcaModelo } from '../../../shared/domain/marca-modelo.util';
import {
  calcularCostoTotal,
  calcularGananciaMinima,
  COSTO_ADICIONAL_DEFAULT,
} from '../domain/precios.util';
import { CATALOG_PRICE } from './ports/catalog-price.port';
import type { CatalogPricePort } from './ports/catalog-price.port';
import { PRECIOS_REPOSITORY } from './ports/precios-repository.port';
import type { PreciosRepositoryPort } from './ports/precios-repository.port';

export interface CreatePrecioCommand {
  marca: string;
  modelo: string;
  costoUnitario: number;
  /** Si no se indica, se usa COSTO_ADICIONAL_DEFAULT. */
  costoAdicional?: number;
  precioPublico?: number;
  precioCierre?: number;
}

export interface UpdatePrecioCommand {
  costoUnitario?: number;
  costoAdicional?: number;
  precioPublico?: number | null;
  precioCierre?: number | null;
}

@Injectable()
export class PreciosService {
  constructor(
    @Inject(PRECIOS_REPOSITORY)
    private readonly preciosRepository: PreciosRepositoryPort,
    @Inject(CATALOG_PRICE) private readonly catalog: CatalogPricePort,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
  ) {}

  async findAll() {
    const items = await this.preciosRepository.findAll();
    return items.map((p) => ({
      ...p,
      gananciaMinima: calcularGananciaMinima(p.precioCierre, p.costoTotal),
    }));
  }

  valoresPorDefecto() {
    return { costoAdicional: COSTO_ADICIONAL_DEFAULT };
  }

  async create(cmd: CreatePrecioCommand, userId?: string) {
    const costoAdicional = cmd.costoAdicional ?? COSTO_ADICIONAL_DEFAULT;
    const costoTotal = calcularCostoTotal(cmd.costoUnitario, costoAdicional);
    const precio = await this.preciosRepository.create({
      marca: cmd.marca,
      modelo: cmd.modelo,
      costoUnitario: cmd.costoUnitario,
      costoAdicional,
      costoTotal,
      precioPublico: cmd.precioPublico ?? null,
      precioCierre: cmd.precioCierre ?? null,
    });
    if (cmd.precioPublico != null) {
      await this.catalog.actualizarPrecioPublico(
        combineMarcaModelo(cmd.marca, cmd.modelo),
        cmd.precioPublico,
      );
    }

    await this.audit.log(
      'CREAR',
      'precio',
      precio.id,
      `Producto agregado a tabla de precios: ${combineMarcaModelo(cmd.marca, cmd.modelo)}`,
      userId,
    );

    return precio;
  }

  async update(id: string, cmd: UpdatePrecioCommand, userId?: string) {
    const existing = await this.preciosRepository.findById(id);
    if (!existing) throw new NotFoundError(`Producto ${id} no encontrado`);

    const costoUnitario = cmd.costoUnitario ?? existing.costoUnitario;
    const costoAdicional = cmd.costoAdicional ?? existing.costoAdicional;

    const precio = await this.preciosRepository.update(id, {
      costoUnitario,
      costoAdicional,
      costoTotal: calcularCostoTotal(costoUnitario, costoAdicional),
      precioPublico:
        cmd.precioPublico !== undefined
          ? cmd.precioPublico
          : existing.precioPublico,
      precioCierre:
        cmd.precioCierre !== undefined
          ? cmd.precioCierre
          : existing.precioCierre,
    });

    if (cmd.precioPublico != null) {
      await this.catalog.actualizarPrecioPublico(
        combineMarcaModelo(existing.marca, existing.modelo),
        cmd.precioPublico,
      );
    }

    await this.audit.log(
      'EDITAR',
      'precio',
      id,
      `Precios editados: ${combineMarcaModelo(existing.marca, existing.modelo)}`,
      userId,
    );

    return precio;
  }
}
