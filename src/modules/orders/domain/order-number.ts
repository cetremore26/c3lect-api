import { randomBytes } from 'crypto';
import { diaDeNegocio } from '../../../shared/domain/fecha-negocio';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomSuffix(len: number): string {
  return Array.from(randomBytes(len))
    .map((b) => ALPHA[b % ALPHA.length])
    .join('');
}

export function buildOrderNumber(ahora: Date = new Date()): string {
  return `C3L-${diaDeNegocio(ahora).replaceAll('-', '')}-${randomSuffix(5)}`;
}
