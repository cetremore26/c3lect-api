import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface NewGastoData {
  fecha: Date;
  concepto: string;
  monto: number;
  responsable: string | null;
  estado: string | null;
}

@Injectable()
export class GastosRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.expense.findMany({ orderBy: { fecha: 'desc' } });
  }

  create(data: NewGastoData) {
    return this.prisma.expense.create({ data });
  }

  async findById(id: string) {
    const gasto = await this.prisma.expense.findUnique({ where: { id } });
    if (!gasto) throw new NotFoundException(`Gasto ${id} no encontrado`);
    return gasto;
  }

  update(id: string, data: Prisma.ExpenseUpdateInput) {
    return this.prisma.expense.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.prisma.expense.delete({ where: { id } });
  }
}
