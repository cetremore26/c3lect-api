import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductsRepository } from './products.repository';
import { QueryProductDto, RangoPrecio } from './dto/query-product.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly productsRepository: ProductsRepository) {}

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

    if (query.page == null && query.limit == null) {
      return this.productsRepository.findAll(where);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const { data, total } = await this.productsRepository.findAllPaginated(where, skip, limit);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  findOne(id: string) {
    return this.productsRepository.findById(id);
  }

  create(dto: CreateProductDto) {
    return this.productsRepository.create(dto);
  }

  update(id: string, dto: UpdateProductDto) {
    return this.productsRepository.update(id, dto);
  }

  remove(id: string) {
    return this.productsRepository.remove(id);
  }

  private parsePriceRange(rango: RangoPrecio): Prisma.IntFilter {
    switch (rango) {
      case RangoPrecio.BAJO:  return { gte: 0,   lte: 150 };
      case RangoPrecio.MEDIO: return { gte: 150, lte: 300 };
      case RangoPrecio.ALTO:  return { gte: 300 };
    }
  }
}
