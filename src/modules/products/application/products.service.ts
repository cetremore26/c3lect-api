import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG } from '../../../shared/application/ports/audit-log.port';
import type { AuditLogPort } from '../../../shared/application/ports/audit-log.port';
import { NotFoundError } from '../../../shared/domain/domain-error';
import {
  estaIncompleto,
  type Product,
  type ProductData,
  type ProductFilter,
  type ProductSort,
} from '../domain/product';
import { PRODUCTS_REPOSITORY } from './ports/products-repository.port';
import type { ProductsRepositoryPort } from './ports/products-repository.port';

// El panel muestra el estado sin replicar la regla.
const conEstado = (p: Product) => ({ ...p, incompleto: estaIncompleto(p) });

export interface ProductQuery extends ProductFilter, ProductSort {
  page?: number;
  limit?: number;
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCTS_REPOSITORY)
    private readonly productsRepository: ProductsRepositoryPort,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
  ) {}

  async findAll(query: ProductQuery) {
    const {
      page: pageQuery,
      limit: limitQuery,
      sortBy,
      sortOrder,
      ...filter
    } = query;
    const sort = { sortBy, sortOrder };

    if (pageQuery == null && limitQuery == null) {
      return (await this.productsRepository.findAll(filter, sort)).map(
        conEstado,
      );
    }

    const page = pageQuery ?? 1;
    const limit = limitQuery ?? 20;
    const skip = (page - 1) * limit;
    const { data, total } = await this.productsRepository.findAllPaginated(
      filter,
      sort,
      skip,
      limit,
    );

    return {
      data: data.map(conEstado),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    return conEstado(await this.findExisting(id));
  }

  async create(data: ProductData, userId?: string) {
    const product = await this.productsRepository.create(data);
    await this.audit.log(
      'CREAR',
      'producto',
      product.id,
      `Producto creado: ${product.display}`,
      userId,
    );
    return product;
  }

  async update(
    id: string,
    data: Partial<Omit<ProductData, 'id'>>,
    userId?: string,
  ) {
    await this.findExisting(id);
    const product = await this.productsRepository.update(id, data);
    await this.audit.log(
      'EDITAR',
      'producto',
      id,
      `Producto editado: ${product.display}`,
      userId,
    );
    return product;
  }

  async remove(id: string, userId?: string) {
    await this.findExisting(id);
    await this.productsRepository.remove(id);
    await this.audit.log(
      'ELIMINAR',
      'producto',
      id,
      `Producto eliminado: ${id}`,
      userId,
    );
    return { message: `Producto "${id}" eliminado` };
  }

  private async findExisting(id: string) {
    const product = await this.productsRepository.findById(id);
    if (!product) throw new NotFoundError(`Producto "${id}" no encontrado`);
    return product;
  }
}
