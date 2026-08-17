import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateVariantDto } from './dto/create-variant.dto';
import type { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductsService } from './products.service';

@Injectable()
export class ProductVariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly events: CatalogEventsService,
    private readonly audit: AuditService,
  ) {}

  async create(productId: string, dto: CreateVariantDto, actorId: string) {
    await this.products.getRowById(productId);
    await this.assertSkuAvailable(dto.sku);
    if (dto.attributeValueIds?.length) {
      await this.assertAttributeValuesExist(dto.attributeValueIds);
    }

    const variant = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.productVariant.updateMany({
          where: { productId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const existingCount = await tx.productVariant.count({
        where: { productId, deletedAt: null },
      });
      return tx.productVariant.create({
        data: {
          productId,
          sku: dto.sku,
          price: dto.price,
          compareAtPrice: dto.compareAtPrice,
          currency: dto.currency ?? 'INR',
          weightGrams: dto.weightGrams,
          isDefault: dto.isDefault ?? existingCount === 0,
          isActive: dto.isActive ?? true,
          attributeValues: dto.attributeValueIds
            ? {
                create: dto.attributeValueIds.map((attributeValueId) => ({
                  attributeValueId,
                })),
              }
            : undefined,
        },
      });
    });

    await this.audit.record({
      actorId,
      action: 'PRODUCT_VARIANT_CREATED',
      entityType: 'product_variant',
      entityId: variant.id,
      metadata: { productId, sku: variant.sku },
    });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  async update(
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
    actorId: string,
  ) {
    const variant = await this.getOwned(productId, variantId);
    if (dto.sku && dto.sku !== variant.sku)
      await this.assertSkuAvailable(dto.sku);
    if (dto.attributeValueIds)
      await this.assertAttributeValuesExist(dto.attributeValueIds);

    await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.productVariant.updateMany({
          where: { productId, isDefault: true, NOT: { id: variantId } },
          data: { isDefault: false },
        });
      }
      if (dto.attributeValueIds) {
        await tx.variantAttributeValue.deleteMany({ where: { variantId } });
      }
      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          sku: dto.sku,
          price: dto.price,
          compareAtPrice: dto.compareAtPrice,
          currency: dto.currency,
          weightGrams: dto.weightGrams,
          isDefault: dto.isDefault,
          isActive: dto.isActive,
          attributeValues: dto.attributeValueIds
            ? {
                create: dto.attributeValueIds.map((attributeValueId) => ({
                  attributeValueId,
                })),
              }
            : undefined,
        },
      });
    });

    await this.audit.record({
      actorId,
      action: 'PRODUCT_VARIANT_UPDATED',
      entityType: 'product_variant',
      entityId: variantId,
      metadata: dto as Record<string, unknown>,
    });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  async remove(productId: string, variantId: string, actorId: string) {
    await this.getOwned(productId, variantId);
    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit.record({
      actorId,
      action: 'PRODUCT_VARIANT_DELETED',
      entityType: 'product_variant',
      entityId: variantId,
      metadata: { productId },
    });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  private async getOwned(productId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant || variant.deletedAt || variant.productId !== productId) {
      throw new NotFoundException({
        code: 'PRODUCT_VARIANT_NOT_FOUND',
        message: 'Product variant not found.',
      });
    }
    return variant;
  }

  private async assertSkuAvailable(sku: string) {
    const existing = await this.prisma.productVariant.findUnique({
      where: { sku },
    });
    if (existing) {
      throw new ConflictException({
        code: 'SKU_ALREADY_EXISTS',
        message: 'A variant with this SKU already exists.',
      });
    }
  }

  private async assertAttributeValuesExist(attributeValueIds: string[]) {
    const count = await this.prisma.attributeValue.count({
      where: { id: { in: attributeValueIds } },
    });
    if (count !== attributeValueIds.length) {
      throw new NotFoundException({
        code: 'ATTRIBUTE_VALUE_NOT_FOUND',
        message: 'One or more attribute values do not exist.',
      });
    }
  }
}
