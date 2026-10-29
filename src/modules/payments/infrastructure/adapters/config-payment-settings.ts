import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PaymentSettingsPort } from '../../application/ports/payment-settings.port';

@Injectable()
export class ConfigPaymentSettings implements PaymentSettingsPort {
  constructor(private readonly config: ConfigService) {}

  webhookSecret(): string {
    return this.config.getOrThrow<string>('MP_WEBHOOK_SECRET');
  }
}
