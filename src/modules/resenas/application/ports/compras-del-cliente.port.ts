export const COMPRAS_DEL_CLIENTE = Symbol('COMPRAS_DEL_CLIENTE');

export interface ProductoRecibido {
  productId: string;
  /** Nombre del producto tal como figuró en el pedido. */
  nombre: string;
}

// Los pedidos son del contexto orders: reseñas solo pregunta por aquí qué
// productos tiene ya el cliente en sus manos, que es lo único que puede reseñar.
export interface ComprasDelClientePort {
  productosRecibidos(userId: string): Promise<ProductoRecibido[]>;
}
