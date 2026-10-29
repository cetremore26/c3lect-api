import { Module } from '@nestjs/common';
import { GASTOS_REPOSITORY } from './application/ports/gastos-repository.port';
import { GastosController } from './infrastructure/http/gastos.controller';
import { GastosService } from './application/gastos.service';
import { GastosRepository } from './infrastructure/persistence/gastos.repository';

@Module({
  controllers: [GastosController],
  providers: [
    GastosService,
    { provide: GASTOS_REPOSITORY, useClass: GastosRepository },
  ],
})
export class GastosModule {}
