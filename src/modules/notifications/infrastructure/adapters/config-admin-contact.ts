import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdminContactPort } from '../../application/ports/mailer.port';

@Injectable()
export class ConfigAdminContact implements AdminContactPort {
  constructor(private readonly config: ConfigService) {}

  adminEmail(): string | undefined {
    return this.config.get<string>('ADMIN_EMAIL');
  }
}
