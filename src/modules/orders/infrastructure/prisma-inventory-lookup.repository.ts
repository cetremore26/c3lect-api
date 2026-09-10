import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  InventarioLookup,
  InventoryLookupPort,
} from '../application/ports/inventory-lookup.port';
import { findInventarioByModelo } from './find-inventario-by-modelo';

@Injectable()
export class PrismaInventoryLookupRepository implements InventoryLookupPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByModelo(
    modelo: string,
    nombreCompletoLegado: string,
  ): Promise<InventarioLookup | null> {
    return findInventarioByModelo(this.prisma, modelo, nombreCompletoLegado);
  }
}
