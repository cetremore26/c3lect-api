import { Prisma } from '@prisma/client';
import {
  limitesDeRango,
  ProductFilter,
  ProductSort,
  ProductSortBy,
  SortOrder,
} from '../../domain/product';

// Traducción del filtro de dominio a la consulta de Prisma. Vive en
// infraestructura porque Prisma.ProductWhereInput es un detalle del ORM;
// antes lo armaba ProductsService.

export function buildProductWhere(
  filter: ProductFilter,
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  if (filter.categoria) {
    where.cat = { equals: filter.categoria, mode: 'insensitive' };
  }
  if (filter.marca) {
    where.marca = { equals: filter.marca, mode: 'insensitive' };
  }
  if (filter.genero) {
    where.genero = { equals: filter.genero, mode: 'insensitive' };
  }
  if (filter.soloDisponibles !== undefined) {
    where.disponible = filter.soloDisponibles;
  }
  if (filter.destacado) {
    where.destacado = true;
  }
  if (filter.rangoPrecio) {
    where.precio = limitesDeRango(filter.rangoPrecio);
  }
  if (filter.incompletos) {
    where.OR = [{ precio: 0 }, { estilo: '' }, { imgs: { equals: [] } }];
  }

  return where;
}

export function buildProductOrderBy(
  sort: ProductSort,
): Prisma.ProductOrderByWithRelationInput[] {
  if (sort.sortBy === ProductSortBy.PRECIO) {
    return [{ precio: sort.sortOrder ?? SortOrder.ASC }];
  }
  return [{ disponible: 'desc' }, { nombre: 'asc' }];
}
