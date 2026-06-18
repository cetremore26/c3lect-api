import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const COSTO_ADICIONAL_DEFAULT = 25028;

@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const items = await this.prisma.inventarioMaestro.findMany({
      orderBy: [{ stock: 'desc' }, { modelo: 'asc' }],
    });
    return items.map((i) => ({
      ...i,
      capitalItem: i.stock * i.costoUnitario,
    }));
  }

  async stockPublico() {
    const items = await this.prisma.inventarioMaestro.findMany({
      select: { modelo: true, stock: true },
    });
    return items;
  }

  async seed() {
    const [compras, ventas] = await Promise.all([
      this.prisma.purchase.findMany({
        select: { modelo: true, cantidad: true, costoUnitario: true, categoria: true },
      }),
      this.prisma.historicalSale.findMany({
        select: { modelo: true },
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

    // Toda venta (incluso Uso Personal con precioVenta=0) descuenta stock físico
    const ventasPorModelo: Record<string, number> = {};
    for (const v of ventas) {
      ventasPorModelo[v.modelo] = (ventasPorModelo[v.modelo] ?? 0) + 1;
    }

    const modelosActivos = Object.keys(porModelo);

    // Eliminar entradas huérfanas (modelos que ya no existen en ninguna compra)
    await this.prisma.inventarioMaestro.deleteMany({
      where: { modelo: { notIn: modelosActivos } },
    });
    // En precios: solo eliminar entradas sin precios manuales (auto-creadas desde compras)
    await this.prisma.precioProducto.deleteMany({
      where: {
        modelo: { notIn: modelosActivos },
        precioPublico: null,
        precioCierre: null,
      },
    });

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

    return { seeded: upsertados, modelos: modelosActivos };
  }
}
