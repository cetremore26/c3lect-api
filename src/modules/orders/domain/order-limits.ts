import { MetodoPago } from './order-status';

// Límites de POST /orders (anónimo): evitan pedidos enormes y el spam por
// correo. Los métodos con pasarela (MercadoPago, tarjetas) entran solo por
// el flujo de pagos, nunca por el checkout directo.
export const METODOS_SIN_PASARELA = [
  MetodoPago.TRANSFERENCIA,
  MetodoPago.CONTRAENTREGA,
  MetodoPago.NEQUI,
  MetodoPago.DAVIPLATA,
] as const;

export const MAX_ITEMS_POR_PEDIDO = 20;
export const MAX_CANTIDAD_POR_ITEM = 10;
export const MAX_PEDIDOS_POR_EMAIL_POR_HORA = 5;
