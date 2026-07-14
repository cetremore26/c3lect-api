import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePrecioDto } from './dto/create-precio.dto';
import { UpdatePrecioDto } from './dto/update-precio.dto';
import { combineMarcaModelo } from '../../common/marca-modelo.util';

@Injectable()
export class PreciosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const items = await this.prisma.precioProducto.findMany({ orderBy: { modelo: 'asc' } });
    return items.map((p) => ({
      ...p,
      gananciaMinima: p.precioCierre != null ? p.precioCierre - p.costoTotal : null,
    }));
  }

  async create(dto: CreatePrecioDto) {
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
    return precio;
  }

  async update(id: string, dto: UpdatePrecioDto) {
    const existing = await this.prisma.precioProducto.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Producto ${id} no encontrado`);

    const costoUnitario = dto.costoUnitario ?? existing.costoUnitario;
    const costoAdicional = dto.costoAdicional ?? existing.costoAdicional;

    const precio = await this.prisma.precioProducto.update({
      where: { id },
      data: {
        costoUnitario,
        costoAdicional,
        costoTotal: costoUnitario + costoAdicional,
        precioPublico: dto.precioPublico !== undefined ? dto.precioPublico : existing.precioPublico,
        precioCierre: dto.precioCierre !== undefined ? dto.precioCierre : existing.precioCierre,
      },
    });

    if (dto.precioPublico != null) {
      await this.syncPrecioPublico(existing.marca, existing.modelo, dto.precioPublico);
    }

    return precio;
  }

  /**
   * El precio público de Precios es el que se muestra y cobra en la tienda.
   * Se propaga a todas las variantes de producto con ese nombre.
   */
  private async syncPrecioPublico(marca: string | null | undefined, modelo: string, precioPublico: number) {
    const nombreCompleto = combineMarcaModelo(marca, modelo);
    await this.prisma.product.updateMany({
      where: { nombre: { equals: nombreCompleto, mode: 'insensitive' } },
      data: { precio: precioPublico },
    });
  }
}
