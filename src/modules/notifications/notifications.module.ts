import { Module } from '@nestjs/common';
import { NotificationsService } from './application/notifications.service';
import { ADMIN_CONTACT, MAILER } from './application/ports/mailer.port';
import { ConfigAdminContact } from './infrastructure/adapters/config-admin-contact';
import { VOUCHER_GENERATOR } from './application/ports/voucher-generator.port';
import { NotificationsSubscribers } from './infrastructure/events/notifications.subscribers';
import { MailModule } from './infrastructure/mail/mail.module';
import { MailService } from './infrastructure/mail/mail.service';
import { PdfVoucherGenerator } from './infrastructure/pdf/pdf-voucher.generator';

// Contexto de notificaciones: no expone API ni tiene tablas. Solo escucha
// eventos de los demás contextos y manda correos.
@Module({
  imports: [MailModule],
  providers: [
    NotificationsService,
    NotificationsSubscribers,
    { provide: MAILER, useExisting: MailService },
    { provide: ADMIN_CONTACT, useClass: ConfigAdminContact },
    { provide: VOUCHER_GENERATOR, useClass: PdfVoucherGenerator },
  ],
})
export class NotificationsModule {}
