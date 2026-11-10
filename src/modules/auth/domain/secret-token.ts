import { createHash, timingSafeEqual } from 'crypto';

const SECRETO = /^[0-9a-f]{64}$/;

export function crearTokenDeReset(id: string, secreto: string): string {
  return `${id}.${secreto}`;
}

/** Corta en el primer '.'; null si el formato no es `<id>.<64 hex>`. */
export function parsearTokenDeReset(
  token: string,
): { id: string; secreto: string } | null {
  const punto = token.indexOf('.');
  if (punto <= 0) return null;
  const id = token.slice(0, punto);
  const secreto = token.slice(punto + 1);
  return SECRETO.test(secreto) ? { id, secreto } : null;
}

export function hashDeSecreto(secreto: string): string {
  return createHash('sha256').update(secreto).digest('hex');
}

export function hashesIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
