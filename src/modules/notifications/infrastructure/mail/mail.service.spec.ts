import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService.sendPaymentAlert', () => {
  it('escapa titulo, pedido y detalle de la alerta', async () => {
    const svc = new MailService({
      get: (k: string) => (k === 'RESEND_API_KEY' ? 're_test' : undefined),
    } as unknown as ConfigService);
    const send = jest.fn().mockResolvedValue({ error: null });
    (svc as unknown as { resend: unknown }).resend = { emails: { send } };

    await svc.sendPaymentAlert('a@x.com', {
      asunto: 'asunto',
      titulo: '<b>t</b>',
      orderNumber: '<i>1</i>',
      detalle: '<img src=x onerror=alert(1)>',
    });

    const html = send.mock.calls[0][0].html as string;
    expect(send.mock.calls[0][0].subject).toBe('asunto');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;t&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;1&lt;/i&gt;');
    expect(html).not.toContain('<img');
  });
});
