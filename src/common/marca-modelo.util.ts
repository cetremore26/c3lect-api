import { Prisma, PrismaClient } from '@prisma/client';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export function combineMarcaModelo(marca: string | null | undefined, modelo: string): string {
  return `${marca ?? ''} ${modelo}`.trim().replace(/\s+/g, ' ');
}

/**
 * Busca el Product correspondiente a un (marca, modelo). Product.nombre sigue siendo el texto
 * completo "Marca Modelo" (no se separa ahí) — primero intenta esa coincidencia, y si no hay
 * marca o no encuentra nada, cae al comportamiento legado: nombre === modelo a secas, para que
 * las filas todavía no migradas (marca null) sigan resolviendo correctamente.
 */
export async function findProductsByMarcaModelo(
  prisma: PrismaLike,
  marca: string | null | undefined,
  modelo: string,
) {
  if (marca) {
    const combinado = combineMarcaModelo(marca, modelo);
    const porCombinado = await prisma.product.findMany({
      where: { nombre: { equals: combinado, mode: 'insensitive' } },
    });
    if (porCombinado.length > 0) return porCombinado;
  }

  return prisma.product.findMany({
    where: { nombre: { equals: modelo, mode: 'insensitive' } },
  });
}

export async function findProductByMarcaModelo(
  prisma: PrismaLike,
  marca: string | null | undefined,
  modelo: string,
) {
  const productos = await findProductsByMarcaModelo(prisma, marca, modelo);
  return productos[0] ?? null;
}

/**
 * Separa marca/modelo a partir de un Product ya cargado, usando Product.marca como prefijo
 * conocido de Product.nombre. Si no aplica (marca ausente o no es prefijo del nombre), devuelve
 * el comportamiento legado: todo el nombre como "modelo", sin marca.
 */
export function deriveMarcaModeloFromProduct(product: {
  nombre: string;
  marca: string | null;
}): { marca: string | null; modelo: string } {
  const { nombre, marca } = product;
  if (marca && nombre.toLowerCase().startsWith(marca.toLowerCase())) {
    const resto = nombre.slice(marca.length).trim();
    if (resto) return { marca, modelo: resto };
  }
  return { marca: null, modelo: nombre };
}
