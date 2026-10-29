import { Module } from '@nestjs/common';
import { AccountService } from './application/account.service';
import { ACCOUNT_REPOSITORY } from './application/ports/account-repository.port';
import { AccountController } from './infrastructure/http/account.controller';
import { AccountRepository } from './infrastructure/persistence/account.repository';

@Module({
  controllers: [AccountController],
  providers: [
    AccountService,
    { provide: ACCOUNT_REPOSITORY, useClass: AccountRepository },
  ],
})
export class AccountModule {}
