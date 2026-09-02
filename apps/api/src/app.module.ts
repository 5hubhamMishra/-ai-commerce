import {
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AddressesModule } from './addresses/addresses.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AttributesModule } from './attributes/attributes.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './brands/brands.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { CacheModule } from './common/cache/cache.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { CatalogEventsModule } from './common/events/catalog-events.module';
import { OrderEventsModule } from './common/events/order-events.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { RolesGuard } from './common/guards/roles.guard';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { ComparisonModule } from './comparison/comparison.module';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { EventsModule } from './events/events.module';
import { ExchangesModule } from './exchanges/exchanges.module';
import { HealthModule } from './health/health.module';
import { HelpCenterModule } from './help-center/help-center.module';
import { InventoryModule } from './inventory/inventory.module';
import { InvoicesModule } from './invoices/invoices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { ProfilesModule } from './profiles/profiles.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { RefundsModule } from './refunds/refunds.module';
import { ReplacementsModule } from './replacements/replacements.module';
import { ReturnsModule } from './returns/returns.module';
import { SearchModule } from './search/search.module';
import { SellersModule } from './sellers/sellers.module';
import { ShippingModule } from './shipping/shipping.module';
import { ShopAIModule } from './shopai/shopai.module';
import { SupportModule } from './support/support.module';
import { UsersModule } from './users/users.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { WishlistModule } from './wishlist/wishlist.module';

const defaultThrottleLimit =
  Number.parseInt(process.env.THROTTLE_DEFAULT_LIMIT ?? '100', 10) || 100;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // Default rate limit; auth endpoints override with a tighter one (see auth.controller.ts).
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: defaultThrottleLimit }],
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    CacheModule,
    CatalogEventsModule,
    OrderEventsModule,
    IdempotencyModule,
    NotificationsModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    AddressesModule,
    AttributesModule,
    CategoriesModule,
    BrandsModule,
    ProductsModule,
    WarehousesModule,
    InventoryModule,
    SearchModule,
    CartModule,
    WishlistModule,
    ComparisonModule,
    ShippingModule,
    OrdersModule,
    PaymentsModule,
    RefundsModule,
    ReplacementsModule,
    ExchangesModule,
    ReturnsModule,
    InvoicesModule,
    SupportModule,
    HelpCenterModule,
    SellersModule,
    EventsModule,
    RecommendationsModule,
    ShopAIModule,
    AnalyticsModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Order matters: authentication (who are you) must run before authorization (are you allowed).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
