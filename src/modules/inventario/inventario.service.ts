import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const COSTO_ADICIONAL_DEFAULT = 25028;

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

  async seed() {
    const [compras, ventas] = await Promise.all([
      this.prisma.purchase.findMany({
        select: { modelo: true, cantidad: true, costoUnitario: true, categoria: true },
      }),
      this.prisma.historicalSale.findMany({
        select: { modelo: true, precioVenta: true },
      }),
    ]);

    // Agrupar compras por modelo
    const porModelo: Record<string, { cantidad: number; costoUnitario: number; categoria: string }> = {};
    for (const c of compras) {
      if (!porModelo[c.modelo]) {
        porModelo[c.modelo] = { cantidad: 0, costoUnitario: c.costoUnitario, categoria: c.categoria };
      }
      porModelo[c.modelo].cantidad += c.cantidad;
      porModelo[c.modelo].costoUnitario = c.costoUnitario; // usa el más reciente
    }

    // Contar ventas efectivas por modelo (excluir Uso Personal donde precioVenta = 0)
    const ventasPorModelo: Record<string, number> = {};
    for (const v of ventas) {
      if (v.precioVenta > 0) {
        ventasPorModelo[v.modelo] = (ventasPorModelo[v.modelo] ?? 0) + 1;
      }
    }

    let upsertados = 0;
    for (const [modelo, datos] of Object.entries(porModelo)) {
      const vendidos = ventasPorModelo[modelo] ?? 0;
      const stock = Math.max(0, datos.cantidad - vendidos);
      const costoTotal = datos.costoUnitario + COSTO_ADICIONAL_DEFAULT;

      await Promise.all([
        this.prisma.inventarioMaestro.upsert({
          where: { modelo },
          update: { stock, costoUnitario: datos.costoUnitario, categoria: datos.categoria },
          create: { modelo, stock, costoUnitario: datos.costoUnitario, categoria: datos.categoria },
        }),
        this.prisma.precioProducto.upsert({
          where: { modelo },
          update: { costoUnitario: datos.costoUnitario, costoTotal },
          create: {
            modelo,
            costoUnitario: datos.costoUnitario,
            costoAdicional: COSTO_ADICIONAL_DEFAULT,
            costoTotal,
          },
        }),
      ]);
      upsertados++;
    }

    return { seeded: upsertados, modelos: Object.keys(porModelo) };
  }
}
