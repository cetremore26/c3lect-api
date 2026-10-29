import { Module } from '@nestjs/common';
import { ComprasFacade } from './application/compras.facade';
import { ComprasService } from './application/compras.service';
import { COMPRAS_REPOSITORY } from './application/ports/compras-repository.port';
import { ComprasController } from './infrastructure/http/compras.controller';
import { ComprasRepository } from './infrastructure/persistence/compras.repository';

@Module({
  controllers: [ComprasController],
  providers: [
    ComprasService,
    ComprasFacade,
    { provide: COMPRAS_REPOSITORY, useClass: ComprasRepository },
  ],
  exports: [ComprasFacade],
})
export class ComprasModule {}
