import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MarcasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<string[]> {
    const [productos, compras] = await Promise.all([
      this.prisma.product.findMany({
        where: { marca: { not: null } },
        select: { marca: true },
        distinct: ['marca'],
      }),
      this.prisma.purchase.findMany({
        where: { marca: { not: null } },
        select: { marca: true },
        distinct: ['marca'],
      }),
    ]);

    const marcas = new Set<string>();
    for (const p of productos) if (p.marca) marcas.add(p.marca);
    for (const c of compras) if (c.marca) marcas.add(c.marca);

    return Array.from(marcas).sort((a, b) => a.localeCompare(b, 'es'));
  }
}
