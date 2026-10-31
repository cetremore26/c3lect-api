import { Global, Module } from '@nestjs/common';
import { AUDIT_LOG } from '../../shared/application/ports/audit-log.port';
import { UsersModule } from '../users/users.module';
import { AuditService } from './application/audit.service';
import { USER_DIRECTORY } from './application/ports/user-directory.port';
import { AuditController } from './infrastructure/http/audit.controller';
import { UsersFacadeUserDirectory } from './infrastructure/adapters/users-facade.user-directory';
import { PrismaAuditRepository } from './infrastructure/persistence/prisma-audit.repository';
import { AUDIT_REPOSITORY } from './application/ports/audit-repository.port';

// Global: cualquier módulo puede inyectar AUDIT_LOG sin importar AuditModule,
// igual que un logger. Los módulos solo conocen el puerto (shared/), nunca a
// AuditService.
@Global()
@Module({
  imports: [UsersModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    { provide: AUDIT_LOG, useExisting: AuditService },
    { provide: AUDIT_REPOSITORY, useClass: PrismaAuditRepository },
    { provide: USER_DIRECTORY, useClass: UsersFacadeUserDirectory },
  ],
  exports: [AUDIT_LOG],
})
export class AuditModule {}
