import { createHmac } from 'crypto';
import {
  VENTANA_FIRMA_MS,
  verifyMpWebhookSignature,
} from './verify-mp-webhook-signature';

const SECRET = 'test-secret';
const AHORA = 1_762_800_000_000;

function firmar(dataId: string, requestId: string, ts: string) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('verifyMpWebhookSignature', () => {
  it('acepta una firma valida', () => {
    const signature = firmar('mp-1', 'req-1', String(AHORA));
    expect(
      verifyMpWebhookSignature(SECRET, 'mp-1', signature, 'req-1', AHORA),
    ).toBe(true);
  });

  it('rechaza una firma que no coincide', () => {
    expect(
      verifyMpWebhookSignature(
        SECRET,
        'mp-1',
        `ts=${AHORA},v1=firma-invalida`,
        'req-1',
        AHORA,
      ),
    ).toBe(false);
  });

  it('rechaza un header sin ts o v1', () => {
    expect(
      verifyMpWebhookSignature(
        SECRET,
        'mp-1',
        'formato-sin-partes-validas',
        'req-1',
        AHORA,
      ),
    ).toBe(false);
  });

  it('rechaza si algo inesperado falla parseando la firma', () => {
    const xSignatureRota = {
      split: () => {
        throw new Error('no es un string');
      },
    } as unknown as string;

    expect(
      verifyMpWebhookSignature(SECRET, 'mp-1', xSignatureRota, 'req-1', AHORA),
    ).toBe(false);
  });

  it('la firma depende del dataId y del requestId exactos', () => {
    const signature = firmar('mp-1', 'req-1', String(AHORA));
    expect(
      verifyMpWebhookSignature(SECRET, 'mp-2', signature, 'req-1', AHORA),
    ).toBe(false);
    expect(
      verifyMpWebhookSignature(SECRET, 'mp-1', signature, 'req-2', AHORA),
    ).toBe(false);
  });

  it('acepta ts en milisegundos dentro de la ventana', () => {
    const signature = firmar('mp-1', 'req-1', String(AHORA - 4 * 60_000));
    expect(
      verifyMpWebhookSignature(SECRET, 'mp-1', signature, 'req-1', AHORA),
    ).toBe(true);
  });

  it('acepta ts en segundos (formato de la documentación)', () => {
    const signature = firmar('mp-1', 'req-1', String(Math.floor(AHORA / 1000)));
    expect(
      verifyMpWebhookSignature(SECRET, 'mp-1', signature, 'req-1', AHORA),
    ).toBe(true);
  });

  it('rechaza una firma valida con ts de hace mas de la ventana', () => {
    const signature = firmar(
      'mp-1',
      'req-1',
      String(AHORA - VENTANA_FIRMA_MS - 1),
    );
    expect(
      verifyMpWebhookSignature(SECRET, 'mp-1', signature, 'req-1', AHORA),
    ).toBe(false);
  });

  it('rechaza una firma valida con ts mas de la ventana en el futuro', () => {
    const signature = firmar(
      'mp-1',
      'req-1',
      String(AHORA + VENTANA_FIRMA_MS + 1),
    );
    expect(
      verifyMpWebhookSignature(SECRET, 'mp-1', signature, 'req-1', AHORA),
    ).toBe(false);
  });

  it('rechaza un ts no numerico', () => {
    const signature = firmar('mp-1', 'req-1', 'abc');
    expect(
      verifyMpWebhookSignature(SECRET, 'mp-1', signature, 'req-1', AHORA),
    ).toBe(false);
  });

  it('rechaza sin lanzar una v1 de longitud distinta', () => {
    expect(
      verifyMpWebhookSignature(
        SECRET,
        'mp-1',
        `ts=${AHORA},v1=abc`,
        'req-1',
        AHORA,
      ),
    ).toBe(false);
  });
});
