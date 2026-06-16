import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const items = await this.prisma.inventarioMaestro.findMany({ orderBy: { modelo: 'asc' } });
    return items.map((i) => ({
      ...i,
      capitalItem: i.stock * i.costoUnitario,
    }));
  }
}
