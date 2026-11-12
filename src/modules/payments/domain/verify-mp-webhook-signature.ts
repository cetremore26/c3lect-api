import { createHmac, timingSafeEqual } from 'crypto';

// Tolerancia máxima entre el ts firmado y el reloj del servidor (antirreplay).
export const VENTANA_FIRMA_MS = 5 * 60 * 1000;

// Verifica la firma HMAC que manda MercadoPago en el header x-signature.
// Pura: recibe el secreto y el reloj (`ahoraMs`) ya resueltos (buscarlos es
// responsabilidad del caller, no de esta regla). Cualquier fallo de parseo
// del header se trata como firma inválida, no como error. El ts puede venir
// en segundos o milisegundos y debe caer dentro de VENTANA_FIRMA_MS.
export function verifyMpWebhookSignature(
  secret: string,
  dataId: string,
  xSignature: string,
  xRequestId: string,
  ahoraMs: number,
): boolean {
  try {
    const parts: Record<string, string> = {};
    for (const part of xSignature.split(',')) {
      const [k, v] = part.split('=');
      if (k && v) parts[k.trim()] = v.trim();
    }
    const { ts, v1 } = parts;
    if (!ts || !v1) return false;

    if (!/^\d+$/.test(ts)) return false;
    const tsMs = ts.length >= 13 ? Number(ts) : Number(ts) * 1000;
    if (Math.abs(ahoraMs - tsMs) > VENTANA_FIRMA_MS) return false;

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expected = Buffer.from(
      createHmac('sha256', secret).update(manifest).digest('hex'),
    );
    const recibida = Buffer.from(v1);
    if (expected.length !== recibida.length) return false;
    return timingSafeEqual(expected, recibida);
  } catch {
    return false;
  }
}
