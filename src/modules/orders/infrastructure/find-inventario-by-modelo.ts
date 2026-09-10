import { Prisma, PrismaClient } from '@prisma/client';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

// Busca InventarioMaestro primero por el modelo derivado de Product.marca+nombre; si la fila
// todavía no fue migrada (marca/modelo separados), cae al comportamiento legado: modelo ===
// el nombre completo del producto. Este fallback es lo que mantiene vivo el checkout mientras
// dure la ventana de backfill.
//
// Se comparte entre PrismaInventoryLookupRepository (consulta suelta, fuera de transacción) y
// PrismaOrderRepository (dentro de la transacción de confirmación/reversión) para no duplicar
// la regla del fallback en dos sitios.
export async function findInventarioByModelo(
  prisma: PrismaLike,
  modelo: string,
  nombreCompletoLegado: string,
) {
  const inv = await prisma.inventarioMaestro.findFirst({
    where: { modelo: { equals: modelo, mode: 'insensitive' } },
  });
  if (inv) return inv;
  if (modelo !== nombreCompletoLegado) {
    return prisma.inventarioMaestro.findFirst({
      where: { modelo: { equals: nombreCompletoLegado, mode: 'insensitive' } },
    });
  }
  return null;
}
