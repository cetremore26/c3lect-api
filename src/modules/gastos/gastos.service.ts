import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';

@Injectable()
export class GastosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.expense.findMany({ orderBy: { fecha: 'desc' } });
  }

  create(dto: CreateGastoDto) {
    return this.prisma.expense.create({
      data: {
        fecha: new Date(dto.fecha),
        concepto: dto.concepto,
        monto: dto.monto,
        responsable: dto.responsable ?? null,
        estado: dto.estado ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateGastoDto) {
    await this.assertExists(id);
    const data: any = {};
    if (dto.fecha)       data.fecha       = new Date(dto.fecha);
    if (dto.concepto)    data.concepto    = dto.concepto;
    if (dto.monto !== undefined) data.monto = dto.monto;
    if (dto.responsable !== undefined) data.responsable = dto.responsable;
    if (dto.estado !== undefined)      data.estado      = dto.estado;
    return this.prisma.expense.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.assertExists(id);
    return this.prisma.expense.delete({ where: { id } });
  }

  private async assertExists(id: string) {
    const found = await this.prisma.expense.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`Gasto ${id} no encontrado`);
  }
}
