import type { LineaCotizada, ShippingSnapshot } from './ports/orders.port';

// Datos del pedido congelados junto al Payment cuando todavía no existe
// ningún Order (flujo nuevo de MercadoPago: el pedido solo se materializa
// si el webhook confirma el pago). Ver HandleWebhookUseCase.
export interface DraftPayload {
  itemsData: LineaCotizada[];
  subtotal: number;
  total: number;
  shippingInfo: ShippingSnapshot;
  userId: string | null;
  fbp?: string | null;
  fbc?: string | null;
}
