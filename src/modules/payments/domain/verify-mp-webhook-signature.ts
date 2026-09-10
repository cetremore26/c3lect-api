import { createHmac } from 'crypto';

// Verifica la firma HMAC que manda MercadoPago en el header x-signature.
// Pura: recibe el secreto ya resuelto (buscarlo en config es responsabilidad
// del caller, no de esta regla). Cualquier fallo de parseo del header se
// trata como firma inválida, no como error — solo lanza si `secret` viniera
// vacío, y eso lo decide quien la llama.
export function verifyMpWebhookSignature(
  secret: string,
  dataId: string,
  xSignature: string,
  xRequestId: string,
): boolean {
  try {
    const parts: Record<string, string> = {};
    for (const part of xSignature.split(',')) {
      const [k, v] = part.split('=');
      if (k && v) parts[k.trim()] = v.trim();
    }
    const { ts, v1 } = parts;
    if (!ts || !v1) return false;

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expected = createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');
    return expected === v1;
  } catch {
    return false;
  }
}
