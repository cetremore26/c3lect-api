// src/modules/meta-conversions/meta-conversions.service.ts
//
// Envía eventos a Meta por Conversions API (server-side).
// Es la fuente de verdad de las conversiones: no depende de bloqueadores de
// anuncios, de Safari con ITP, ni de que el navegador del cliente ejecute JS.
//
// Variables de entorno necesarias (Render):
//   META_PIXEL_ID=xxxxxxxxxxxxxxx
//   META_CAPI_ACCESS_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   META_CAPI_TEST_EVENT_CODE=TEST12345   (SOLO mientras pruebas; quitar después)
//
// Sin META_CAPI_TEST_EVENT_CODE los eventos NO aparecen en la pestaña
// "Test Events" de Events Manager. Aparecen en "Overview", pero con retraso
// de varios minutos. Esta es la razón número uno por la que la gente cree
// que su Conversions API no funciona cuando en realidad sí funciona.

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export type MetaActionSource = 'website' | 'other' | 'business_messaging';

export interface MetaUserData {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  /** Cookie _fbp del navegador. Súbela desde el frontend en el body del pedido. */
  fbp?: string | null;
  /** Cookie _fbc del navegador (o fb.1.<ts>.<fbclid>). Es lo que ata la venta al clic del anuncio. */
  fbc?: string | null;
}

export interface MetaEventInput {
  eventName: 'Purchase' | 'Lead' | 'Contact' | 'CompleteRegistration' | 'InitiateCheckout';
  /**
   * Clave de deduplicación. Para compras DEBE ser el orderNumber, porque es
   * el mismo valor que usa trackPurchase() en el navegador y el mismo que
   * MercadoPago recibe como external_reference.
   */
  eventId: string;
  eventSourceUrl?: string;
  actionSource?: MetaActionSource;
  value?: number;
  currency?: string;
  contentIds?: string[];
  user: MetaUserData;
  /** Unix seconds. Solo para eventos pasados (máximo 7 días atrás). */
  eventTime?: number;
}

@Injectable()
export class MetaConversionsService {
  private readonly logger = new Logger(MetaConversionsService.name);
  private readonly pixelId = process.env.META_PIXEL_ID;
  private readonly accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  private readonly testEventCode = process.env.META_CAPI_TEST_EVENT_CODE;
  private readonly apiVersion = 'v23.0';

  private get habilitado(): boolean {
    return Boolean(this.pixelId && this.accessToken);
  }

  /** SHA-256 en minúsculas y sin espacios, que es lo que exige Meta. */
  private hash(value: string): string {
    return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
  }

  /**
   * Normaliza un teléfono colombiano a E.164 sin el '+' antes de hashear.
   * "317 859 8407"    → "573178598407"
   * "+57 317 859 8407" → "573178598407"
   *
   * El archivo original solo hacía replace(/\D/g, ''), que deja "3178598407"
   * sin indicativo de país. Ese hash no coincide con ningún usuario de Meta,
   * así que el teléfono viajaba pero no servía para nada.
   */
  private normalizarTelefono(phone: string): string | null {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('57') && digits.length >= 12) return digits;
    if (digits.length === 10) return `57${digits}`;
    return digits;
  }

  /**
   * Normaliza ciudad y departamento como exige Meta:
   * "lowercase only with no punctuation, no special characters, and no spaces".
   *
   * El acento es determinante. "Medellín" y "medellin" dan hashes distintos, así
   * que cuando el cliente escribe con tilde Meta no encuentra a nadie con ese
   * hash y la ciudad deja de aportar al match quality. En Colombia media base de
   * clientes escribe con tilde y la otra media sin ella, así que sin esto se
   * perdía la mitad del dato.
   *
   * Esto importa más aquí que en el navegador: en el frontend el hash lo calcula
   * el propio pixel de Meta, que puede normalizar por su cuenta. Aquí el hash lo
   * calculamos nosotros, así que lo que mandemos mal se queda mal.
   *
   * normalize('NFD') separa cada letra de su tilde ("í" → "i" + ´) y el replace
   * borra las tildes sueltas. La ñ pasa a n, que es lo que Meta espera.
   */
  private normalizarLugar(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Normaliza nombres y apellidos: "lowercase only with no punctuation".
   *
   * OJO — al revés que en la ciudad, aquí los acentos SÍ se conservan. Meta
   * acepta caracteres especiales en fn y ln siempre que vayan en UTF-8, así que
   * "José" debe viajar como "josé". Quitarle la tilde rompería el dato en vez
   * de arreglarlo, y bajaría el match quality en lugar de subirlo.
   */
  private normalizarNombre(texto: string): string {
    return texto
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private construirUserData(user: MetaUserData): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    if (user.email) data.em = [this.hash(user.email)];

    if (user.phone) {
      const tel = this.normalizarTelefono(user.phone);
      if (tel) data.ph = [this.hash(tel)];
    }

    if (user.firstName) {
      const fn = this.normalizarNombre(user.firstName);
      if (fn) data.fn = [this.hash(fn)];
    }
    if (user.lastName) {
      const ln = this.normalizarNombre(user.lastName);
      if (ln) data.ln = [this.hash(ln)];
    }
    if (user.city) {
      const ct = this.normalizarLugar(user.city);
      if (ct) data.ct = [this.hash(ct)];
    }
    if (user.state) {
      const st = this.normalizarLugar(user.state);
      if (st) data.st = [this.hash(st)];
    }

    // País siempre Colombia: es un dato gratis que sube el match quality.
    data.country = [this.hash('co')];

    // Sin hashear — Meta los espera en claro.
    if (user.clientIp) data.client_ip_address = user.clientIp;
    if (user.userAgent) data.client_user_agent = user.userAgent;
    if (user.fbp) data.fbp = user.fbp;
    if (user.fbc) data.fbc = user.fbc;

    return data;
  }

  /** Envío genérico. Nunca lanza: un fallo de Meta no debe tumbar un pedido. */
  async sendEvent(input: MetaEventInput): Promise<void> {
    if (!this.habilitado) {
      this.logger.warn(
        `META_PIXEL_ID o META_CAPI_ACCESS_TOKEN no configurados. Evento ${input.eventName} omitido.`,
      );
      return;
    }

    const customData: Record<string, unknown> = {};
    if (input.value != null) customData.value = input.value;
    if (input.value != null) customData.currency = input.currency ?? 'COP';
    if (input.contentIds?.length) {
      customData.content_ids = input.contentIds;
      customData.content_type = 'product';
    }

    const body: Record<string, unknown> = {
      data: [
        {
          event_name: input.eventName,
          event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
          event_id: input.eventId,
          event_source_url: input.eventSourceUrl,
          action_source: input.actionSource ?? 'website',
          user_data: this.construirUserData(input.user),
          custom_data: customData,
        },
      ],
    };

    // Solo mientras estás probando. Con este código presente, los eventos
    // aparecen en Events Manager → Test Events casi al instante.
    if (this.testEventCode) body.test_event_code = this.testEventCode;

    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${this.pixelId}/events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // El token va en el header, NO en la query string: así no queda
            // escrito en los logs de acceso de Render ni en los de Meta.
            Authorization: `Bearer ${this.accessToken}`,
          },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`Meta CAPI respondió ${res.status} para ${input.eventName}: ${text}`);
        return;
      }

      const json = (await res.json()) as { events_received?: number; fbtrace_id?: string };
      this.logger.log(
        `Meta CAPI ${input.eventName} enviado (event_id=${input.eventId}, recibidos=${json.events_received ?? '?'})`,
      );
    } catch (err) {
      this.logger.error(`Error enviando evento ${input.eventName} a Meta CAPI`, err as Error);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Atajos por caso de uso
  // ───────────────────────────────────────────────────────────────────────────

  /** Compra pagada en la web (MercadoPago aprobado o contraentrega confirmado). */
  async sendPurchase(params: {
    orderNumber: string;
    total: number;
    contentIds: string[];
    user: MetaUserData;
  }): Promise<void> {
    await this.sendEvent({
      eventName: 'Purchase',
      eventId: params.orderNumber, // mismo id que usa el pixel del navegador
      eventSourceUrl: `${process.env.FRONTEND_URL ?? 'https://c3lect.com'}/checkout/success`,
      actionSource: 'website',
      value: params.total,
      currency: 'COP',
      contentIds: params.contentIds,
      user: params.user,
    });
  }

  /**
   * Venta cerrada por WhatsApp y registrada a mano en el panel de admin.
   *
   * Esto es lo que le devuelve a Meta la señal de tus ventas reales. Sin esto,
   * Meta solo ve las compras del checkout web (una fracción de tu negocio) y
   * optimiza las campañas hacia el público equivocado.
   *
   * action_source: 'other' es el valor correcto para una conversión que no
   * ocurrió en el sitio web.
   */
  async sendOfflinePurchase(params: {
    ventaId: string;
    total: number;
    contentIds?: string[];
    user: MetaUserData;
    /** Fecha real de la venta en unix seconds. Meta acepta hasta 7 días atrás. */
    eventTime?: number;
  }): Promise<void> {
    await this.sendEvent({
      eventName: 'Purchase',
      eventId: `venta_${params.ventaId}`,
      actionSource: 'other',
      value: params.total,
      currency: 'COP',
      contentIds: params.contentIds,
      user: params.user,
      eventTime: params.eventTime,
    });
  }

  /** Cuenta nueva creada en /register — el evento de la campaña de lanzamiento. */
  async sendCompleteRegistration(params: {
    userId: string;
    user: MetaUserData;
  }): Promise<void> {
    await this.sendEvent({
      eventName: 'CompleteRegistration',
      eventId: `reg_${params.userId}`,
      eventSourceUrl: `${process.env.FRONTEND_URL ?? 'https://c3lect.com'}/register`,
      actionSource: 'website',
      user: params.user,
    });
  }
}
