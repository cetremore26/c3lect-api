import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ProductsRepository } from './products.repository';
import {
  QueryProductDto,
  RangoPrecio,
  ProductSortBy,
  SortOrder,
} from './dto/query-product.dto';
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
    if (query.soloDisponibles !== undefined) {
      where.disponible = query.soloDisponibles;
    }
    if (query.destacado) {
      where.destacado = true;
    }
    if (query.rangoPrecio) {
      where.precio = this.parsePriceRange(query.rangoPrecio);
    }
    if (query.incompletos) {
      where.OR = [{ precio: 0 }, { estilo: '' }, { imgs: { equals: [] } }];
    }

    const orderBy = this.buildOrderBy(query.sortBy, query.sortOrder);

    if (query.page == null && query.limit == null) {
      return this.productsRepository.findAll(where, orderBy);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const { data, total } = await this.productsRepository.findAllPaginated(
      where,
      skip,
      limit,
      orderBy,
    );

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

  private buildOrderBy(
    sortBy?: ProductSortBy,
    sortOrder?: SortOrder,
  ): Prisma.ProductOrderByWithRelationInput[] {
    if (sortBy === ProductSortBy.PRECIO) {
      return [{ precio: sortOrder ?? SortOrder.ASC }];
    }
    return [{ disponible: 'desc' }, { nombre: 'asc' }];
  }

  private parsePriceRange(rango: RangoPrecio): Prisma.IntFilter {
    switch (rango) {
      case RangoPrecio.BAJO:
        return { gte: 0, lte: 150 };
      case RangoPrecio.MEDIO:
        return { gte: 150, lte: 300 };
      case RangoPrecio.ALTO:
        return { gte: 300 };
    }
  }
}
