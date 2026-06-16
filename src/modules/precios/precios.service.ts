import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePrecioDto } from './dto/create-precio.dto';
import { UpdatePrecioDto } from './dto/update-precio.dto';

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

  create(dto: CreatePrecioDto) {
    const costoTotal = dto.costoUnitario + dto.costoAdicional;
    return this.prisma.precioProducto.create({
      data: {
        modelo: dto.modelo,
        costoUnitario: dto.costoUnitario,
        costoAdicional: dto.costoAdicional,
        costoTotal,
        precioPublico: dto.precioPublico ?? null,
        precioCierre: dto.precioCierre ?? null,
      },
    });
  }

  async update(id: string, dto: UpdatePrecioDto) {
    const existing = await this.prisma.precioProducto.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Producto ${id} no encontrado`);

    const costoUnitario = dto.costoUnitario ?? existing.costoUnitario;
    const costoAdicional = dto.costoAdicional ?? existing.costoAdicional;

    return this.prisma.precioProducto.update({
      where: { id },
      data: {
        costoUnitario,
        costoAdicional,
        costoTotal: costoUnitario + costoAdicional,
        precioPublico: dto.precioPublico !== undefined ? dto.precioPublico : existing.precioPublico,
        precioCierre: dto.precioCierre !== undefined ? dto.precioCierre : existing.precioCierre,
      },
    });
  }
}
