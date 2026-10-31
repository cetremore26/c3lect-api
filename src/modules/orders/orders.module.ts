import { Module } from '@nestjs/common';
import { InventarioModule } from '../inventario/inventario.module';
import { ProductsModule } from '../products/products.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { OrdersFacade } from './application/orders.facade';
import { INVENTORY_LOOKUP } from './application/ports/inventory-lookup.port';
import { ORDER_PRODUCT_CATALOG } from './application/ports/order-product-catalog.port';
import { ORDER_REPOSITORY } from './application/ports/order-repository.port';
import { PRICE_QUOTE } from './application/ports/price-quote.port';
import { CreateConfirmedOrderUseCase } from './application/use-cases/create-confirmed-order.use-case';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { GetOrderUseCase } from './application/use-cases/get-order.use-case';
import { LinkGuestOrdersUseCase } from './application/use-cases/link-guest-orders.use-case';
import { ListOrdersUseCase } from './application/use-cases/list-orders.use-case';
import { ResolveOrderItemsUseCase } from './application/use-cases/resolve-order-items.use-case';
import { UpdateOrderStatusUseCase } from './application/use-cases/update-order-status.use-case';
import { CatalogAdapter } from './infrastructure/adapters/catalog.adapter';
import { InventoryAdapter } from './infrastructure/adapters/inventory.adapter';
import { PriceQuoteAdapter } from './infrastructure/adapters/price-quote.adapter';
import { OrdersEventSubscribers } from './infrastructure/events/orders-event.subscribers';
import { OrdersController } from './infrastructure/http/orders.controller';
import { PrismaOrderRepository } from './infrastructure/persistence/prisma-order.repository';

// Composition root del contexto de pedidos: el único lugar donde cada puerto
// se conecta con su implementación. Importa los módulos de otros contextos
// solo para obtener sus fachadas públicas (consultas síncronas); los efectos
// entre contextos viajan por eventos.
@Module({
  imports: [ProductsModule, InventarioModule, PromotionsModule],
  controllers: [OrdersController],
  providers: [
    OrdersFacade,
    ResolveOrderItemsUseCase,
    CreateOrderUseCase,
    CreateConfirmedOrderUseCase,
    UpdateOrderStatusUseCase,
    ListOrdersUseCase,
    GetOrderUseCase,
    LinkGuestOrdersUseCase,
    OrdersEventSubscribers,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    { provide: ORDER_PRODUCT_CATALOG, useClass: CatalogAdapter },
    { provide: INVENTORY_LOOKUP, useClass: InventoryAdapter },
    { provide: PRICE_QUOTE, useClass: PriceQuoteAdapter },
  ],
  exports: [OrdersFacade],
})
export class OrdersModule {}
