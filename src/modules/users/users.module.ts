import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { CUSTOMER_ORDERS } from './application/ports/customer-orders.port';
import { USERS_REPOSITORY } from './application/ports/users-repository.port';
import { UsersFacade } from './application/users.facade';
import { UsersService } from './application/users.service';
import { OrdersFacadeCustomerOrders } from './infrastructure/adapters/orders-facade.customer-orders';
import { UsersController } from './infrastructure/http/users.controller';
import { UsersRepository } from './infrastructure/persistence/users.repository';

@Module({
  imports: [OrdersModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersFacade,
    { provide: USERS_REPOSITORY, useClass: UsersRepository },
    { provide: CUSTOMER_ORDERS, useClass: OrdersFacadeCustomerOrders },
  ],
  exports: [UsersFacade],
})
export class UsersModule {}
