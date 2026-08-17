import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateImageDto } from './dto/create-image.dto';
import type { UpdateImageDto } from './dto/update-image.dto';
import { ProductsService } from './products.service';

@Injectable()
export class ProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly events: CatalogEventsService,
  ) {}

  async create(productId: string, dto: CreateImageDto) {
    await this.products.getRowById(productId);
    if (dto.variantId)
      await this.assertVariantBelongsToProduct(productId, dto.variantId);

    await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.productImage.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      await tx.productImage.create({
        data: {
          productId,
          variantId: dto.variantId,
          url: dto.url,
          altText: dto.altText,
          sortOrder: dto.sortOrder ?? 0,
          isPrimary: dto.isPrimary ?? false,
        },
      });
    });

    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  async update(productId: string, imageId: string, dto: UpdateImageDto) {
    await this.getOwned(productId, imageId);
    if (dto.variantId)
      await this.assertVariantBelongsToProduct(productId, dto.variantId);

    await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.productImage.updateMany({
          where: { productId, isPrimary: true, NOT: { id: imageId } },
          data: { isPrimary: false },
        });
      }
      await tx.productImage.update({
        where: { id: imageId },
        data: {
          url: dto.url,
          variantId: dto.variantId,
          altText: dto.altText,
          sortOrder: dto.sortOrder,
          isPrimary: dto.isPrimary,
        },
      });
    });

    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  async remove(productId: string, imageId: string) {
    await this.getOwned(productId, imageId);
    await this.prisma.productImage.delete({ where: { id: imageId } });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  private async getOwned(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });
    if (!image || image.productId !== productId) {
      throw new NotFoundException({
        code: 'PRODUCT_IMAGE_NOT_FOUND',
        message: 'Product image not found.',
      });
    }
    return image;
  }

  private async assertVariantBelongsToProduct(
    productId: string,
    variantId: string,
  ) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant || variant.productId !== productId) {
      throw new NotFoundException({
        code: 'PRODUCT_VARIANT_NOT_FOUND',
        message: 'Product variant not found.',
      });
    }
  }
}
