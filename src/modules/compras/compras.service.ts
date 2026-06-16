import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompraDto } from './dto/create-compra.dto';

const COSTO_ADICIONAL_DEFAULT = 25028;

@Injectable()
export class ComprasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCompraDto) {
    const costoTotal = dto.cantidad * dto.costoUnitario;

    const compra = await this.prisma.purchase.create({
      data: {
        fecha: new Date(dto.fecha),
        modelo: dto.modelo,
        cantidad: dto.cantidad,
        costoUnitario: dto.costoUnitario,
        costoTotal,
        categoria: dto.categoria,
      },
    });

    // Actualizar inventario: sumar stock, actualizar costo unitario
    await this.prisma.inventarioMaestro.upsert({
      where: { modelo: dto.modelo },
      update: {
        stock: { increment: dto.cantidad },
        costoUnitario: dto.costoUnitario,
        categoria: dto.categoria,
      },
      create: {
        modelo: dto.modelo,
        stock: dto.cantidad,
        costoUnitario: dto.costoUnitario,
        categoria: dto.categoria,
      },
    });

    // Actualizar tabla de precios — crea si no existe con costo adicional por defecto
    await this.prisma.precioProducto.upsert({
      where: { modelo: dto.modelo },
      update: {
        costoUnitario: dto.costoUnitario,
        costoTotal: dto.costoUnitario + COSTO_ADICIONAL_DEFAULT,
      },
      create: {
        modelo: dto.modelo,
        costoUnitario: dto.costoUnitario,
        costoAdicional: COSTO_ADICIONAL_DEFAULT,
        costoTotal: dto.costoUnitario + COSTO_ADICIONAL_DEFAULT,
      },
    });

    return compra;
  }
}
