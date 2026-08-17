import { Module } from '@nestjs/common';
import { ProductImagesService } from './product-images.service';
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
    ProductSpecificationsService,
    ProductTagsService,
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
