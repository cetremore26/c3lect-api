// Vocabulario del catálogo, sin Prisma ni Nest.

export interface ProductData {
  id: string;
  nombre: string;
  estilo: string;
  display: string;
  precio: number;
  disponible?: boolean;
  destacado?: boolean;
  destacadoOrden?: number;
  cat: string;
  marca?: string;
  genero?: string;
  imgs?: string[];
  specMovimiento?: string;
  specDimensiones?: string;
  specCaja?: string;
  specCorrea?: string;
  specCristal?: string;
  specFunciones?: string;
  specResistenciaAgua?: string;
  specPeso?: string;
  specBateria?: string;
  specReservaMarcha?: string;
  specObservaciones?: string;
  notasDescripcion?: string;
  notasTop?: string;
  notasCorazon?: string;
  notasBase?: string;
}

/** Producto tal como está guardado: los opcionales del alta vienen como null. */
export type Product = {
  [K in keyof ProductData]-?: undefined extends ProductData[K]
    ? Exclude<ProductData[K], undefined> | null
    : ProductData[K];
} & {
  disponible: boolean;
  destacado: boolean;
  imgs: string[];
};

/**
 * Producto pendiente por completar (sin precio, estilo o imágenes): no se
 * publica en la tienda. La misma regla la aplican el filtro `incompletos`
 * (product-query.ts) y la vista catalogo_publico.
 */
export function estaIncompleto(p: {
  precio: number;
  estilo: string;
  imgs: string[];
}): boolean {
  return p.precio === 0 || p.estilo === '' || p.imgs.length === 0;
}

export enum RangoPrecio {
  BAJO = '0-150',
  MEDIO = '150-300',
  ALTO = '300+',
}

export enum ProductSortBy {
  PRECIO = 'precio',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export interface ProductFilter {
  categoria?: string;
  marca?: string;
  genero?: string;
  rangoPrecio?: RangoPrecio;
  soloDisponibles?: boolean;
  destacado?: boolean;
  /** Pendientes por completar: sin precio, imágenes o estilo. */
  incompletos?: boolean;
}

export interface ProductSort {
  sortBy?: ProductSortBy;
  sortOrder?: SortOrder;
}

export function limitesDeRango(rango: RangoPrecio): {
  gte: number;
  lte?: number;
} {
  switch (rango) {
    case RangoPrecio.BAJO:
      return { gte: 0, lte: 150 };
    case RangoPrecio.MEDIO:
      return { gte: 150, lte: 300 };
    case RangoPrecio.ALTO:
      return { gte: 300 };
  }
}
