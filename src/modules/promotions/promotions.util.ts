// Lógica pura de promociones — sin dependencias de Nest/Prisma para poder
// portarse 1:1 a src/app/lib/promotions.ts en el frontend (boveda-c3lect-v2),
// que evalúa las mismas reglas sobre las mismas filas leídas directo de
// Supabase. Cualquier cambio de reglas acá debe replicarse ahí también.

export interface PromocionLike {
  alcance: 'PRODUCTO' | 'CATEGORIA' | 'MARCA' | 'TODOS';
  porcentaje: number;
  productosIncluidos: string[];
  categoria: string | null;
  marca: string | null;
  excluidos: string[];
  soloCuentaActiva: boolean;
  fechaInicio: Date;
  fechaFin: Date;
  activo: boolean;
}

export interface ProductoLike {
  id: string;
  cat: string;
  marca: string | null;
}

export function promocionAplica(
  promo: PromocionLike,
  producto: ProductoLike,
): boolean {
  if (promo.excluidos.includes(producto.id)) return false;

  switch (promo.alcance) {
    case 'TODOS':
      return true;
    case 'CATEGORIA':
      return promo.categoria != null && promo.categoria === producto.cat;
    case 'MARCA':
      return promo.marca != null && promo.marca === producto.marca;
    case 'PRODUCTO':
      return promo.productosIncluidos.includes(producto.id);
  }
}

export function estaVigente(
  promo: PromocionLike,
  ahora: Date = new Date(),
): boolean {
  return promo.activo && ahora >= promo.fechaInicio && ahora <= promo.fechaFin;
}

// Descuento en % (0-100) a aplicar: el mayor entre todas las promociones
// vigentes que apliquen al producto. Las promociones con soloCuentaActiva
// solo cuentan si el comprador está autenticado. Nunca se acumulan.
export function mejorDescuento(
  promociones: PromocionLike[],
  producto: ProductoLike,
  autenticado: boolean,
): number {
  return promociones.reduce((mejor, promo) => {
    if (!estaVigente(promo)) return mejor;
    if (promo.soloCuentaActiva && !autenticado) return mejor;
    if (!promocionAplica(promo, producto)) return mejor;
    return Math.max(mejor, promo.porcentaje);
  }, 0);
}

export function calcularPrecioFinal(
  precioOriginal: number,
  descuentoPorcentaje: number,
): number {
  if (descuentoPorcentaje <= 0) return precioOriginal;
  return Math.round(precioOriginal * (1 - descuentoPorcentaje / 100));
}
