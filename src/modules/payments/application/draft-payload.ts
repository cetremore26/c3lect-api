import { CreateOrderDto } from '../../orders/dto/create-order.dto';

// Datos del pedido congelados junto al Payment cuando todavía no existe
// ningún Order (flujo nuevo de MercadoPago: el pedido solo se materializa
// si el webhook confirma el pago). Ver HandleWebhookUseCase.
export interface DraftPayload {
  itemsData: {
    productId: string;
    nombre: string;
    precioUnitario: number;
    cantidad: number;
    subtotal: number;
  }[];
  subtotal: number;
  total: number;
  shippingInfo: CreateOrderDto['shippingInfo'];
  userId: string | null;
  fbp?: string | null;
  fbc?: string | null;
}
