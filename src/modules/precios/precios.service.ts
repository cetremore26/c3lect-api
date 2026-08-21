import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePrecioDto } from './dto/create-precio.dto';
import { UpdatePrecioDto } from './dto/update-precio.dto';
import { combineMarcaModelo } from '../../common/marca-modelo.util';

@Injectable()
export class PreciosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    const items = await this.prisma.precioProducto.findMany({
      orderBy: { modelo: 'asc' },
    });
    return items.map((p) => ({
      ...p,
      gananciaMinima:
        p.precioCierre != null ? p.precioCierre - p.costoTotal : null,
    }));
  }

  async create(dto: CreatePrecioDto, userId?: string) {
    const costoTotal = dto.costoUnitario + dto.costoAdicional;
    const precio = await this.prisma.precioProducto.create({
      data: {
        marca: dto.marca,
        modelo: dto.modelo,
        costoUnitario: dto.costoUnitario,
        costoAdicional: dto.costoAdicional,
        costoTotal,
        precioPublico: dto.precioPublico ?? null,
        precioCierre: dto.precioCierre ?? null,
      },
    });
    if (dto.precioPublico != null) {
      await this.syncPrecioPublico(dto.marca, dto.modelo, dto.precioPublico);
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
    const existing = await this.prisma.precioProducto.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Producto ${id} no encontrado`);

    const costoUnitario = dto.costoUnitario ?? existing.costoUnitario;
    const costoAdicional = dto.costoAdicional ?? existing.costoAdicional;

    const precio = await this.prisma.precioProducto.update({
      where: { id },
      data: {
        costoUnitario,
        costoAdicional,
        costoTotal: costoUnitario + costoAdicional,
        precioPublico:
          dto.precioPublico !== undefined
            ? dto.precioPublico
            : existing.precioPublico,
        precioCierre:
          dto.precioCierre !== undefined
            ? dto.precioCierre
            : existing.precioCierre,
      },
    });

    if (dto.precioPublico != null) {
      await this.syncPrecioPublico(
        existing.marca,
        existing.modelo,
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

  /**
   * El precio público de Precios es el que se muestra y cobra en la tienda.
   * Se propaga a todas las variantes de producto con ese nombre.
   */
  private async syncPrecioPublico(
    marca: string | null | undefined,
    modelo: string,
    precioPublico: number,
  ) {
    const nombreCompleto = combineMarcaModelo(marca, modelo);
    await this.prisma.product.updateMany({
      where: { nombre: { equals: nombreCompleto, mode: 'insensitive' } },
      data: { precio: precioPublico },
    });
  }
}
