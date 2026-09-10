import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PrecioProductoData {
  marca: string;
  modelo: string;
  costoUnitario: number;
  costoAdicional: number;
  costoTotal: number;
  precioPublico: number | null;
  precioCierre: number | null;
}

@Injectable()
export class PreciosRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.precioProducto.findMany({ orderBy: { modelo: 'asc' } });
  }

  async findById(id: string) {
    const precio = await this.prisma.precioProducto.findUnique({
      where: { id },
    });
    if (!precio) throw new NotFoundException(`Producto ${id} no encontrado`);
    return precio;
  }

  create(data: PrecioProductoData) {
    return this.prisma.precioProducto.create({ data });
  }

  update(id: string, data: Partial<PrecioProductoData>) {
    return this.prisma.precioProducto.update({ where: { id }, data });
  }

  /**
   * El precio público de Precios es el que se muestra y cobra en la tienda.
   * Se propaga a todas las variantes de producto con ese nombre.
   */
  async syncPrecioPublico(
    nombreCompleto: string,
    precioPublico: number,
  ): Promise<void> {
    await this.prisma.product.updateMany({
      where: { nombre: { equals: nombreCompleto, mode: 'insensitive' } },
      data: { precio: precioPublico },
    });
  }
}
