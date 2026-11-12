// Función pura de dominio: dado el catálogo ya cargado y el precio final que
// cotizó promociones para cada producto, arma las líneas del pedido. Nunca
// confía en precios que mande el cliente — esa es la razón de ser de esta
// pieza. Las reglas de descuento son del contexto promotions; aquí solo
// llega su resultado.

export interface PriceableProduct {
  id: string;
  nombre: string;
  precio: number;
  cat: string;
  marca: string | null;
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

// Une las lineas repetidas del mismo producto sumando cantidades, en el orden
// de primera aparicion.
export function fusionarItemsRepetidos(
  items: RequestedItem[],
): RequestedItem[] {
  const porId = new Map<string, RequestedItem>();
  for (const item of items) {
    const previo = porId.get(item.productId);
    if (previo) previo.cantidad += item.cantidad;
    else porId.set(item.productId, { ...item });
  }
  return [...porId.values()];
}

export function priceOrderItems(
  items: RequestedItem[],
  products: Map<string, PriceableProduct>,
  preciosFinales: Map<string, number>,
): PricedOrder {
  const itemsData = items.map((item) => {
    const product = products.get(item.productId)!;
    const precioUnitario = preciosFinales.get(item.productId) ?? product.precio;
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
