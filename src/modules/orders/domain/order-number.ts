import { randomBytes } from 'crypto';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomSuffix(len: number): string {
  return Array.from(randomBytes(len))
    .map((b) => ALPHA[b % ALPHA.length])
    .join('');
}

export function buildOrderNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `C3L-${y}${m}${d}-${randomSuffix(5)}`;
}
