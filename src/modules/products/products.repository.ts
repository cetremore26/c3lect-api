import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(where: Prisma.ProductWhereInput) {
    return this.prisma.product.findMany({
      where,
      orderBy: [{ disponible: 'desc' }, { nombre: 'asc' }],
    });
  }

  async findById(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException(`Producto "${id}" no encontrado`);
    return product;
  }

  create(data: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        id:               data.id,
        nombre:           data.nombre,
        estilo:           data.estilo,
        display:          data.display,
        precio:           data.precio,
        disponible:       data.disponible ?? true,
        cat:              data.cat,
        marca:            data.marca,
        genero:           data.genero,
        imgs:             data.imgs ?? [],
        specMovimiento:   data.specMovimiento,
        specDimensiones:  data.specDimensiones,
        specCaja:         data.specCaja,
        specCorrea:       data.specCorrea,
        specCristal:      data.specCristal,
        specFunciones:    data.specFunciones,
        specResistenciaAgua: data.specResistenciaAgua,
        specPeso:         data.specPeso,
        specBateria:      data.specBateria,
        specReservaMarcha: data.specReservaMarcha,
        specObservaciones: data.specObservaciones,
        notasDescripcion: data.notasDescripcion,
        notasTop:         data.notasTop,
        notasCorazon:     data.notasCorazon,
        notasBase:        data.notasBase,
      },
    });
  }

  async update(id: string, data: UpdateProductDto) {
    await this.findById(id);
    return this.prisma.product.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findById(id);
    await this.prisma.product.delete({ where: { id } });
    return { message: `Producto "${id}" eliminado` };
  }

  async syncFromInventario(): Promise<{ creados: number; modelos: string[] }> {
    const CAT_MAP: Record<string, string> = { Reloj: 'reloj', Perfume: 'perfume', Accesorio: 'accesorio' };

    function slugify(s: string): string {
      return s
        .toLowerCase()
        .replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e')
        .replace(/[íìîï]/g, 'i').replace(/[óòôö]/g, 'o')
        .replace(/[úùûü]/g, 'u').replace(/ñ/g, 'n')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    const [inventario, productos] = await Promise.all([
      this.prisma.inventarioMaestro.findMany(),
      this.prisma.product.findMany({ select: { nombre: true } }),
    ]);

    const nombresExistentes = new Set(productos.map((p) => p.nombre.toLowerCase()));
    const creados: string[] = [];

    for (const inv of inventario) {
      if (nombresExistentes.has(inv.modelo.toLowerCase())) continue;

      const id  = slugify(inv.modelo);
      const cat = CAT_MAP[inv.categoria] ?? 'reloj';

      try {
        await this.prisma.product.create({
          data: {
            id,
            nombre: inv.modelo,
            estilo: '',
            display: inv.modelo,
            precio: 0,
            disponible: false,
            cat,
            imgs: [],
          },
        });
        creados.push(inv.modelo);
      } catch {
        // Colisión de slug con producto diferente — intentar con sufijo numérico
        try {
          await this.prisma.product.create({
            data: {
              id: `${id}-${Date.now()}`,
              nombre: inv.modelo,
              estilo: '',
              display: inv.modelo,
              precio: 0,
              disponible: false,
              cat,
              imgs: [],
            },
          });
          creados.push(inv.modelo);
        } catch { /* ignorar */ }
      }
    }

    return { creados: creados.length, modelos: creados };
  }
}
