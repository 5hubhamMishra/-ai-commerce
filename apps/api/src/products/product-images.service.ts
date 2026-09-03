import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
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
    private readonly audit: AuditService,
  ) {}

  async create(productId: string, dto: CreateImageDto, actorId: string) {
    await this.products.getRowById(productId);
    if (dto.variantId)
      await this.assertVariantBelongsToProduct(productId, dto.variantId);

    const image = await this.prisma
      .$transaction(async (tx) => {
        if (dto.isPrimary) {
          await tx.productImage.updateMany({
            where: { productId, isPrimary: true },
            data: { isPrimary: false },
          });
        }
        return tx.productImage.create({
          data: {
            productId,
            variantId: dto.variantId,
            url: dto.url,
            altText: dto.altText,
            sortOrder: dto.sortOrder ?? 0,
            isPrimary: dto.isPrimary ?? false,
          },
        });
      })
      .catch((error: unknown) => {
        throw this.mapPrimaryConflict(error);
      });

    await this.audit.record({
      actorId,
      action: 'PRODUCT_IMAGE_CREATED',
      entityType: 'product_image',
      entityId: image.id,
      metadata: { productId },
    });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  async update(
    productId: string,
    imageId: string,
    dto: UpdateImageDto,
    actorId: string,
  ) {
    if (dto.variantId)
      await this.assertVariantBelongsToProduct(productId, dto.variantId);

    await this.prisma
      .$transaction(async (tx) => {
        if (dto.isPrimary) {
          await tx.productImage.updateMany({
            where: { productId, isPrimary: true, NOT: { id: imageId } },
            data: { isPrimary: false },
          });
        }
        const updated = await tx.productImage.updateMany({
          where: { id: imageId, productId },
          data: {
            url: dto.url,
            variantId: dto.variantId,
            altText: dto.altText,
            sortOrder: dto.sortOrder,
            isPrimary: dto.isPrimary,
          },
        });
        if (updated.count === 0) {
          throw new NotFoundException({
            code: 'PRODUCT_IMAGE_NOT_FOUND',
            message: 'Product image not found.',
          });
        }
      })
      .catch((error: unknown) => {
        throw this.mapPrimaryConflict(error);
      });

    await this.audit.record({
      actorId,
      action: 'PRODUCT_IMAGE_UPDATED',
      entityType: 'product_image',
      entityId: imageId,
      metadata: { productId, ...dto },
    });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  async remove(productId: string, imageId: string, actorId: string) {
    const deleted = await this.prisma.productImage.deleteMany({
      where: { id: imageId, productId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException({
        code: 'PRODUCT_IMAGE_NOT_FOUND',
        message: 'Product image not found.',
      });
    }
    await this.audit.record({
      actorId,
      action: 'PRODUCT_IMAGE_DELETED',
      entityType: 'product_image',
      entityId: imageId,
      metadata: { productId },
    });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
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

  private mapPrimaryConflict(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException({
        code: 'PRIMARY_IMAGE_CHANGED',
        message: 'Another image became primary before this change was applied.',
      });
    }
    return error;
  }
}
