import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { DevelopmentPayoutAdapter } from './providers/development-payout.adapter';
import { DevelopmentVerificationAdapter } from './providers/development-verification.adapter';
import { SELLER_PAYOUT_PROVIDER } from './providers/seller-payout-provider.interface';
import { SELLER_VERIFICATION_PROVIDER } from './providers/seller-verification-provider.interface';
import { SellerCatalogController } from './seller-catalog.controller';
import { SellerCatalogService } from './seller-catalog.service';
import {
  SellerCommerceAdminController,
  SellerCommerceController,
} from './seller-commerce.controller';
import { SellerCommerceService } from './seller-commerce.service';
import { SellerRatingsController } from './seller-ratings.controller';
import { SellerRatingsService } from './seller-ratings.service';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';

@Module({
  imports: [ProductsModule, InventoryModule, WarehousesModule],
  controllers: [
    SellersController,
    SellerCatalogController,
    SellerCommerceController,
    SellerCommerceAdminController,
    SellerRatingsController,
  ],
  providers: [
    DevelopmentVerificationAdapter,
    {
      provide: SELLER_VERIFICATION_PROVIDER,
      useExisting: DevelopmentVerificationAdapter,
    },
    DevelopmentPayoutAdapter,
    { provide: SELLER_PAYOUT_PROVIDER, useExisting: DevelopmentPayoutAdapter },
    SellersService,
    SellerCatalogService,
    SellerCommerceService,
    SellerRatingsService,
  ],
  exports: [SellersService],
})
export class SellersModule {}
