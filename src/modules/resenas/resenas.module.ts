import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { AUTORES } from './application/ports/autores.port';
import { COMPRAS_DEL_CLIENTE } from './application/ports/compras-del-cliente.port';
import { RESENAS_REPOSITORY } from './application/ports/resenas-repository.port';
import { ResenasService } from './application/resenas.service';
import { OrdersComprasDelCliente } from './infrastructure/adapters/orders.compras-del-cliente';
import { UsersAutores } from './infrastructure/adapters/users.autores';
import { ResenasController } from './infrastructure/http/resenas.controller';
import { ResenasRepository } from './infrastructure/persistence/resenas.repository';

// Composition root del contexto de reseñas. Consulta pedidos (qué recibió el
// cliente) e identidad (con qué nombre firma) solo a través de sus fachadas.
@Module({
  imports: [OrdersModule, UsersModule],
  controllers: [ResenasController],
  providers: [
    ResenasService,
    { provide: RESENAS_REPOSITORY, useClass: ResenasRepository },
    { provide: COMPRAS_DEL_CLIENTE, useClass: OrdersComprasDelCliente },
    { provide: AUTORES, useClass: UsersAutores },
  ],
})
export class ResenasModule {}
