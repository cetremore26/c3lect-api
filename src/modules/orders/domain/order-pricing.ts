import {
  calcularPrecioFinal,
  mejorDescuento,
  PromocionLike,
  ProductoLike,
} from '../../promotions/promotions.util';

// Función pura de dominio: dado el catálogo ya cargado y las promociones
// vigentes, calcula el precio real de cada item. Nunca confía en precios que
// mande el cliente — esa es la razón de ser de esta pieza. Sin dependencias
// de Prisma/Nest para poder testearla en aislamiento.

export interface PriceableProduct extends ProductoLike {
  nombre: string;
  precio: number;
}

export interface RequestedItem {
  productId: string;
  cantidad: number;
}

export interface PricedOrderItem {
  productId: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  subtotal: number;
}

export interface PricedOrder {
  itemsData: PricedOrderItem[];
  subtotal: number;
  total: number;
}

export function priceOrderItems(
  items: RequestedItem[],
  products: Map<string, PriceableProduct>,
  promocionesVigentes: PromocionLike[],
  autenticado: boolean,
): PricedOrder {
  const itemsData = items.map((item) => {
    const product = products.get(item.productId)!;
    const descuentoPorcentaje = mejorDescuento(
      promocionesVigentes,
      product,
      autenticado,
    );
    const precioUnitario = calcularPrecioFinal(
      product.precio,
      descuentoPorcentaje,
    );
    return {
      productId: item.productId,
      nombre: product.nombre,
      precioUnitario,
      cantidad: item.cantidad,
      subtotal: precioUnitario * item.cantidad,
    };
  });

  const subtotal = itemsData.reduce((sum, i) => sum + i.subtotal, 0);
  return { itemsData, subtotal, total: subtotal };
}
