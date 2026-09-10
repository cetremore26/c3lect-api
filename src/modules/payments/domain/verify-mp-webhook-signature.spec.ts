import { createHmac } from 'crypto';
import { verifyMpWebhookSignature } from './verify-mp-webhook-signature';

const SECRET = 'test-secret';

function firmar(dataId: string, requestId: string, ts = '1700000000') {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('verifyMpWebhookSignature', () => {
  it('acepta una firma valida', () => {
    const signature = firmar('mp-1', 'req-1');
    expect(verifyMpWebhookSignature(SECRET, 'mp-1', signature, 'req-1')).toBe(
      true,
    );
  });

  it('rechaza una firma que no coincide', () => {
    expect(
      verifyMpWebhookSignature(
        SECRET,
        'mp-1',
        'ts=123,v1=firma-invalida',
        'req-1',
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
      verifyMpWebhookSignature(SECRET, 'mp-1', xSignatureRota, 'req-1'),
    ).toBe(false);
  });

  it('la firma depende del dataId y del requestId exactos', () => {
    const signature = firmar('mp-1', 'req-1');
    expect(verifyMpWebhookSignature(SECRET, 'mp-2', signature, 'req-1')).toBe(
      false,
    );
    expect(verifyMpWebhookSignature(SECRET, 'mp-1', signature, 'req-2')).toBe(
      false,
    );
  });
});
