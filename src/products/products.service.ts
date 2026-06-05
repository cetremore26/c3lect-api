import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryProductDto, RangoPrecio } from './dto/query-product.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryProductDto) {
    const where: Prisma.ProductWhereInput = {};

    if (query.categoria) {
      where.cat = { equals: query.categoria, mode: 'insensitive' };
    }

    if (query.marca) {
      where.marca = { equals: query.marca, mode: 'insensitive' };
    }

    if (query.genero) {
      where.genero = { equals: query.genero, mode: 'insensitive' };
    }

    if (query.soloDisponibles) {
      where.disponible = true;
    }

    if (query.rangoPrecio) {
      where.precio = this.parsePriceRange(query.rangoPrecio);
    }

    return this.prisma.product.findMany({
      where,
      orderBy: [{ disponible: 'desc' }, { nombre: 'asc' }],
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException(`Producto "${id}" no encontrado`);
    return product;
  }

  private parsePriceRange(rango: RangoPrecio): Prisma.IntFilter {
    switch (rango) {
      case RangoPrecio.BAJO:  return { gte: 0,   lte: 150 };
      case RangoPrecio.MEDIO: return { gte: 150, lte: 300 };
      case RangoPrecio.ALTO:  return { gte: 300 };
    }
  }
}
