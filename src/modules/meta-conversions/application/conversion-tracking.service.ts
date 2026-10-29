import { Inject, Injectable } from '@nestjs/common';
import { CONVERSIONS_API } from './ports/conversions-api.port';
import type { ConversionsApiPort } from './ports/conversions-api.port';

interface ClienteWeb {
  email: string;
  nombreCompleto: string;
  telefono: string;
  ciudad: string;
  departamento: string;
}

function separarNombre(nombreCompleto: string | undefined) {
  const partes = nombreCompleto?.trim().split(' ');
  return {
    firstName: partes?.[0],
    lastName: partes?.slice(1).join(' '),
  };
}

// Qué conversiones se reportan a Meta y con qué datos. Antes estaba copiado
// en CreateOrderUseCase, HandleWebhookUseCase y VentasService.
@Injectable()
export class ConversionTrackingService {
  constructor(
    @Inject(CONVERSIONS_API) private readonly meta: ConversionsApiPort,
  ) {}

  /**
   * Purchase de la web. Para MercadoPago se manda cuando el pago se aprueba
   * (fuente de verdad: no depende de bloqueadores ni de que el navegador siga
   * abierto); para contraentrega/transferencia, al crear el pedido, porque
   * nunca pasan por el webhook. event_id = orderNumber en ambos casos, para
   * que Meta deduplique contra el evento del navegador.
   */
  compraWeb(c: {
    orderNumber: string;
    total: number;
    productIds: string[];
    cliente: ClienteWeb | null;
    fbp: string | null;
    fbc: string | null;
  }): Promise<void> {
    return this.meta.sendPurchase({
      orderNumber: c.orderNumber,
      total: c.total,
      contentIds: c.productIds,
      user: {
        email: c.cliente?.email,
        phone: c.cliente?.telefono,
        ...separarNombre(c.cliente?.nombreCompleto),
        city: c.cliente?.ciudad,
        state: c.cliente?.departamento,
        fbp: c.fbp,
        fbc: c.fbc,
      },
    });
  }

  /** Venta cerrada por chat y registrada a mano: Purchase offline. */
  async ventaOffline(v: {
    ventaId: string;
    precioVenta: number;
    cliente: string;
    celular: string | null;
    fecha: Date;
    elegibleMetaOffline: boolean;
  }): Promise<void> {
    if (!v.elegibleMetaOffline) return;
    await this.meta.sendOfflinePurchase({
      ventaId: v.ventaId,
      total: v.precioVenta,
      user: { phone: v.celular, ...separarNombre(v.cliente) },
      eventTime: Math.floor(v.fecha.getTime() / 1000),
    });
  }
}
