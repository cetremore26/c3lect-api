import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService.sendStockAlert', () => {
  it('escapa el detalle de la alerta', async () => {
    const svc = new MailService({
      get: (k: string) => (k === 'RESEND_API_KEY' ? 're_test' : undefined),
    } as unknown as ConfigService);
    const send = jest.fn().mockResolvedValue({ error: null });
    (svc as unknown as { resend: unknown }).resend = { emails: { send } };

    await svc.sendStockAlert(
      'a@x.com',
      'C3L-1',
      '<img src=x onerror=alert(1)>',
    );

    expect(send.mock.calls[0][0].html).toContain(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });
});
