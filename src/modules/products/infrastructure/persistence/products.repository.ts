import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../../shared/infrastructure/prisma/prisma-transaction.host';
import { combineMarcaModelo } from '../../../../shared/domain/marca-modelo.util';
import {
  ProductsRepositoryPort,
  StubData,
} from '../../application/ports/products-repository.port';
import type {
  Product,
  ProductData,
  ProductFilter,
  ProductSort,
} from '../../domain/product';
import { buildProductOrderBy, buildProductWhere } from './product-query';

const porNombre = (nombre: string) => ({
  nombre: { equals: nombre, mode: 'insensitive' as const },
});

@Injectable()
export class ProductsRepository implements ProductsRepositoryPort {
  constructor(private readonly db: PrismaTransactionHost) {}

  findAll(filter: ProductFilter, sort: ProductSort): Promise<Product[]> {
    return this.db.client.product.findMany({
      where: buildProductWhere(filter),
      orderBy: buildProductOrderBy(sort),
    });
  }

  async findAllPaginated(
    filter: ProductFilter,
    sort: ProductSort,
    skip: number,
    take: number,
  ) {
    const where = buildProductWhere(filter);
    const [data, total] = await Promise.all([
      this.db.client.product.findMany({
        where,
        orderBy: buildProductOrderBy(sort),
        skip,
        take,
      }),
      this.db.client.product.count({ where }),
    ]);
    return { data, total };
  }

  findById(id: string): Promise<Product | null> {
    return this.db.client.product.findUnique({ where: { id } });
  }

  findByIds(ids: string[], soloDisponibles: boolean): Promise<Product[]> {
    return this.db.client.product.findMany({
      where: {
        id: { in: ids },
        ...(soloDisponibles ? { disponible: true } : {}),
      },
    });
  }

  create(data: ProductData): Promise<Product> {
    return this.db.client.product.create({
      data: {
        id: data.id,
        nombre: data.nombre,
        estilo: data.estilo,
        display: data.display,
        precio: data.precio,
        disponible: data.disponible ?? true,
        destacado: data.destacado ?? false,
        destacadoOrden: data.destacadoOrden ?? null,
        cat: data.cat,
        marca: data.marca,
        genero: data.genero,
        imgs: data.imgs ?? [],
        specMovimiento: data.specMovimiento,
        specDimensiones: data.specDimensiones,
        specCaja: data.specCaja,
        specCorrea: data.specCorrea,
        specCristal: data.specCristal,
        specFunciones: data.specFunciones,
        specResistenciaAgua: data.specResistenciaAgua,
        specPeso: data.specPeso,
        specBateria: data.specBateria,
        specReservaMarcha: data.specReservaMarcha,
        specObservaciones: data.specObservaciones,
        notasDescripcion: data.notasDescripcion,
        notasTop: data.notasTop,
        notasCorazon: data.notasCorazon,
        notasBase: data.notasBase,
      },
    });
  }

  update(id: string, data: Partial<Omit<ProductData, 'id'>>): Promise<Product> {
    return this.db.client.product.update({ where: { id }, data });
  }

  async remove(id: string): Promise<void> {
    await this.db.client.product.delete({ where: { id } });
  }

  async findMarcas(): Promise<string[]> {
    const rows = await this.db.client.product.findMany({
      where: { marca: { not: null } },
      select: { marca: true },
      distinct: ['marca'],
    });
    return rows.flatMap((r) => (r.marca ? [r.marca] : []));
  }

  async setDisponibilidadPorNombre(
    nombre: string,
    disponible: boolean,
  ): Promise<void> {
    await this.db.client.product.updateMany({
      where: { ...porNombre(nombre), disponible: !disponible },
      data: { disponible },
    });
  }

  async setPrecioPorNombre(nombre: string, precio: number): Promise<void> {
    await this.db.client.product.updateMany({
      where: porNombre(nombre),
      data: { precio },
    });
  }

  async renombrar(
    nombreAnterior: string,
    nombreNuevo: string,
    marca: string | null,
  ): Promise<number> {
    const { count } = await this.db.client.product.updateMany({
      where: porNombre(nombreAnterior),
      data: { nombre: nombreNuevo, ...(marca ? { marca } : {}) },
    });
    return count;
  }

  async findByMarcaModelo(
    marca: string | null,
    modelo: string,
  ): Promise<Product[]> {
    if (marca) {
      const porCombinado = await this.db.client.product.findMany({
        where: porNombre(combineMarcaModelo(marca, modelo)),
      });
      if (porCombinado.length > 0) return porCombinado;
    }
    return this.db.client.product.findMany({ where: porNombre(modelo) });
  }

  async existsId(id: string): Promise<boolean> {
    const found = await this.db.client.product.findUnique({
      where: { id },
      select: { id: true },
    });
    return found !== null;
  }

  async createStub(data: StubData): Promise<void> {
    await this.db.client.product.create({
      data: {
        id: data.id,
        nombre: data.nombre,
        estilo: '',
        display: data.nombre,
        precio: 0,
        disponible: false, // pendiente — admin completa datos e imágenes
        cat: data.cat,
        imgs: [],
        marca: data.marca ?? undefined,
      },
    });
  }

  async enable(ids: string[]): Promise<void> {
    await this.db.client.product.updateMany({
      where: { id: { in: ids } },
      data: { disponible: true },
    });
  }

  async setMarca(ids: string[], marca: string): Promise<void> {
    await this.db.client.product.updateMany({
      where: { id: { in: ids } },
      data: { marca },
    });
  }
}
