import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CreatePrecioDto } from './dto/create-precio.dto';
import { UpdatePrecioDto } from './dto/update-precio.dto';
import { combineMarcaModelo } from '../../common/marca-modelo.util';
import { PreciosRepository } from './precios.repository';
import { calcularCostoTotal, calcularGananciaMinima } from './precios.util';

@Injectable()
export class PreciosService {
  constructor(
    private readonly preciosRepository: PreciosRepository,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    const items = await this.preciosRepository.findAll();
    return items.map((p) => ({
      ...p,
      gananciaMinima: calcularGananciaMinima(p.precioCierre, p.costoTotal),
    }));
  }

  async create(dto: CreatePrecioDto, userId?: string) {
    const costoTotal = calcularCostoTotal(
      dto.costoUnitario,
      dto.costoAdicional,
    );
    const precio = await this.preciosRepository.create({
      marca: dto.marca,
      modelo: dto.modelo,
      costoUnitario: dto.costoUnitario,
      costoAdicional: dto.costoAdicional,
      costoTotal,
      precioPublico: dto.precioPublico ?? null,
      precioCierre: dto.precioCierre ?? null,
    });
    if (dto.precioPublico != null) {
      await this.preciosRepository.syncPrecioPublico(
        combineMarcaModelo(dto.marca, dto.modelo),
        dto.precioPublico,
      );
    }

    await this.audit.log(
      'CREAR',
      'precio',
      precio.id,
      `Producto agregado a tabla de precios: ${combineMarcaModelo(dto.marca, dto.modelo)}`,
      userId,
    );

    return precio;
  }

  async update(id: string, dto: UpdatePrecioDto, userId?: string) {
    const existing = await this.preciosRepository.findById(id);

    const costoUnitario = dto.costoUnitario ?? existing.costoUnitario;
    const costoAdicional = dto.costoAdicional ?? existing.costoAdicional;

    const precio = await this.preciosRepository.update(id, {
      costoUnitario,
      costoAdicional,
      costoTotal: calcularCostoTotal(costoUnitario, costoAdicional),
      precioPublico:
        dto.precioPublico !== undefined
          ? dto.precioPublico
          : existing.precioPublico,
      precioCierre:
        dto.precioCierre !== undefined
          ? dto.precioCierre
          : existing.precioCierre,
    });

    if (dto.precioPublico != null) {
      await this.preciosRepository.syncPrecioPublico(
        combineMarcaModelo(existing.marca, existing.modelo),
        dto.precioPublico,
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
