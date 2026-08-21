import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { validate } from './config/environment';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './modules/products/products.module';
import { AuthModule } from './auth/auth.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AuditModule } from './modules/audit/audit.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { UsersModule } from './modules/users/users.module';
import { AccountModule } from './modules/account/account.module';
import { VentasModule } from './modules/ventas/ventas.module';
import { ComprasModule } from './modules/compras/compras.module';
import { GastosModule } from './modules/gastos/gastos.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { PreciosModule } from './modules/precios/precios.module';
import { MarcasModule } from './modules/marcas/marcas.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { MetaConversionsModule } from './modules/meta-conversions/meta-conversions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60000, limit: 100 },
        { name: 'auth', ttl: 60000, limit: 8 },
      ],
    }),
    PrismaModule,
    ProductsModule,
    AuthModule,
    OrdersModule,
    PaymentsModule,
    AuditModule,
    MetricsModule,
    UsersModule,
    AccountModule,
    VentasModule,
    ComprasModule,
    GastosModule,
    InventarioModule,
    PreciosModule,
    MarcasModule,
    PromotionsModule,
    MetaConversionsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
