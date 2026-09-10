import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { MailModule } from '../../mail/mail.module';
import { AuditModule } from '../audit/audit.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { MetaConversionsModule } from '../meta-conversions/meta-conversions.module';
import { ORDER_REPOSITORY } from './application/ports/order-repository.port';
import { ORDER_PRODUCT_CATALOG } from './application/ports/order-product-catalog.port';
import { INVENTORY_LOOKUP } from './application/ports/inventory-lookup.port';
import { PrismaOrderRepository } from './infrastructure/prisma-order.repository';
import { PrismaProductCatalogRepository } from './infrastructure/prisma-product-catalog.repository';
import { PrismaInventoryLookupRepository } from './infrastructure/prisma-inventory-lookup.repository';
import { ResolveOrderItemsUseCase } from './application/use-cases/resolve-order-items.use-case';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { CreateConfirmedOrderUseCase } from './application/use-cases/create-confirmed-order.use-case';
import { UpdateOrderStatusUseCase } from './application/use-cases/update-order-status.use-case';
import { ListOrdersUseCase } from './application/use-cases/list-orders.use-case';
import { GetOrderUseCase } from './application/use-cases/get-order.use-case';
import { LinkGuestOrdersUseCase } from './application/use-cases/link-guest-orders.use-case';

@Module({
  imports: [MailModule, AuditModule, PromotionsModule, MetaConversionsModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    ResolveOrderItemsUseCase,
    CreateOrderUseCase,
    CreateConfirmedOrderUseCase,
    UpdateOrderStatusUseCase,
    ListOrdersUseCase,
    GetOrderUseCase,
    LinkGuestOrdersUseCase,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    {
      provide: ORDER_PRODUCT_CATALOG,
      useClass: PrismaProductCatalogRepository,
    },
    { provide: INVENTORY_LOOKUP, useClass: PrismaInventoryLookupRepository },
  ],
  // ORDER_REPOSITORY se exporta además del facade: PaymentsService lo usa
  // directamente para cargar un Order sin reimplementar su propia query (ver
  // PaymentsModule).
  exports: [OrdersService, ORDER_REPOSITORY],
})
export class OrdersModule {}
