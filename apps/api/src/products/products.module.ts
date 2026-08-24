import { Module } from '@nestjs/common';
import { ProductImagesService } from './product-images.service';
import { ProductReviewsService } from './product-reviews.service';
import { ProductSpecificationsService } from './product-specifications.service';
import { ProductTagsService } from './product-tags.service';
import { ProductVariantsService } from './product-variants.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [
    ProductsService,
    ProductVariantsService,
    ProductImagesService,
    ProductReviewsService,
    ProductSpecificationsService,
    ProductTagsService,
  ],
  // All exported (Phase 5): SellerCatalogService reuses these directly for
  // the seller-scoped catalog endpoints rather than duplicating their logic.
  exports: [
    ProductsService,
    ProductVariantsService,
    ProductImagesService,
    ProductReviewsService,
    ProductSpecificationsService,
    ProductTagsService,
  ],
})
export class ProductsModule {}
