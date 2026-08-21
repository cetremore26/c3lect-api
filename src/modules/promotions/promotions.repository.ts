import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';

@Injectable()
export class PromotionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findVigentes(ahora: Date) {
    return this.prisma.promotion.findMany({
      where: {
        activo: true,
        fechaInicio: { lte: ahora },
        fechaFin: { gte: ahora },
      },
    });
  }

  async findById(id: string) {
    const promo = await this.prisma.promotion.findUnique({ where: { id } });
    if (!promo) throw new NotFoundException(`Promoción "${id}" no encontrada`);
    return promo;
  }

  create(data: CreatePromotionDto) {
    return this.prisma.promotion.create({
      data: {
        nombre: data.nombre,
        alcance: data.alcance,
        porcentaje: data.porcentaje,
        productosIncluidos: data.productosIncluidos ?? [],
        categoria: data.categoria,
        marca: data.marca,
        excluidos: data.excluidos ?? [],
        soloCuentaActiva: data.soloCuentaActiva ?? false,
        fechaInicio: new Date(data.fechaInicio),
        fechaFin: new Date(data.fechaFin),
        activo: data.activo ?? true,
      },
    });
  }

  async update(id: string, data: UpdatePromotionDto) {
    await this.findById(id);
    return this.prisma.promotion.update({
      where: { id },
      data: {
        ...data,
        fechaInicio: data.fechaInicio ? new Date(data.fechaInicio) : undefined,
        fechaFin: data.fechaFin ? new Date(data.fechaFin) : undefined,
      },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    await this.prisma.promotion.delete({ where: { id } });
    return { message: `Promoción "${id}" eliminada` };
  }
}
