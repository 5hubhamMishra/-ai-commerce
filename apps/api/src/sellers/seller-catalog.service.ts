import { Injectable, NotFoundException } from '@nestjs/common';
import { InventoryService } from '../inventory/inventory.service';
import type { SetInventoryDto } from '../inventory/dto/set-inventory.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ProductImagesService } from '../products/product-images.service';
import { ProductSpecificationsService } from '../products/product-specifications.service';
import { ProductTagsService } from '../products/product-tags.service';
import { ProductVariantsService } from '../products/product-variants.service';
import { ProductsService } from '../products/products.service';
import type { AssignTagDto } from '../products/dto/assign-tag.dto';
import type { CreateImageDto } from '../products/dto/create-image.dto';
import type { CreateProductDto } from '../products/dto/create-product.dto';
import type { CreateSpecificationDto } from '../products/dto/create-specification.dto';
import type { CreateVariantDto } from '../products/dto/create-variant.dto';
import type { ListProductsQueryDto } from '../products/dto/list-products-query.dto';
import type { UpdateImageDto } from '../products/dto/update-image.dto';
import type { UpdateProductDto } from '../products/dto/update-product.dto';
import type { UpdateSpecificationDto } from '../products/dto/update-specification.dto';
import type { UpdateVariantDto } from '../products/dto/update-variant.dto';
import type { UpdateWarehouseDto } from '../warehouses/dto/update-warehouse.dto';
import { WarehousesService } from '../warehouses/warehouses.service';
import { SellersService } from './sellers.service';

/**
 * Thin ownership-checking layer in front of the existing (Phase 2/3)
 * catalog/inventory services — every method resolves the caller's own
 * sellerId, verifies they actually own the resource in question, then
 * delegates to the exact same service/method an admin's `/products` request
 * would use. No catalog business logic is duplicated here.
 */
@Injectable()
export class SellerCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellers: SellersService,
    private readonly products: ProductsService,
    private readonly variants: ProductVariantsService,
    private readonly images: ProductImagesService,
    private readonly specifications: ProductSpecificationsService,
    private readonly tags: ProductTagsService,
    private readonly inventory: InventoryService,
    private readonly warehouses: WarehousesService,
  ) {}

  // ---- Products -------------------------------------------------------------

  async listOwn(userId: string, query: ListProductsQueryDto) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    return this.products.listAdmin(query, sellerId);
  }

  async getOwn(userId: string, productId: string) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.products.findByIdAdmin(productId);
  }

  async create(userId: string, dto: CreateProductDto) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.sellers.assertVerifiedSeller(sellerId);
    return this.products.create(dto, userId, sellerId);
  }

  async update(userId: string, productId: string, dto: UpdateProductDto) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.products.update(productId, dto, userId);
  }

  async remove(userId: string, productId: string) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.products.remove(productId, userId);
  }

  // ---- Variants ---------------------------------------------------------------

  async addVariant(userId: string, productId: string, dto: CreateVariantDto) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.variants.create(productId, dto, userId);
  }

  async updateVariant(
    userId: string,
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.variants.update(productId, variantId, dto, userId);
  }

  async removeVariant(userId: string, productId: string, variantId: string) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.variants.remove(productId, variantId, userId);
  }

  // ---- Images / specifications / tags ------------------------------------------

  async addImage(userId: string, productId: string, dto: CreateImageDto) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.images.create(productId, dto);
  }

  async updateImage(
    userId: string,
    productId: string,
    imageId: string,
    dto: UpdateImageDto,
  ) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.images.update(productId, imageId, dto);
  }

  async removeImage(userId: string, productId: string, imageId: string) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.images.remove(productId, imageId);
  }

  async addSpecification(
    userId: string,
    productId: string,
    dto: CreateSpecificationDto,
  ) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.specifications.create(productId, dto);
  }

  async updateSpecification(
    userId: string,
    productId: string,
    specId: string,
    dto: UpdateSpecificationDto,
  ) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.specifications.update(productId, specId, dto);
  }

  async removeSpecification(userId: string, productId: string, specId: string) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.specifications.remove(productId, specId);
  }

  async assignTag(userId: string, productId: string, dto: AssignTagDto) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.tags.assign(productId, dto.name);
  }

  async removeTag(userId: string, productId: string, tagId: string) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsProduct(sellerId, productId);
    return this.tags.remove(productId, tagId);
  }

  // ---- Inventory ----------------------------------------------------------------

  async getInventory(userId: string, variantId: string) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.assertOwnsVariant(sellerId, variantId);
    return this.inventory.listForVariant(variantId);
  }

  /** Always targets the seller's own single auto-provisioned warehouse — no
   *  warehouseId in the route, since sellers don't manage multiple this
   *  phase (see DECISIONS.md ADR-020). */
  async setInventory(userId: string, variantId: string, dto: SetInventoryDto) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    await this.sellers.assertVerifiedSeller(sellerId);
    await this.assertOwnsVariant(sellerId, variantId);
    const warehouse = await this.getOwnWarehouse(sellerId);
    return this.inventory.set(variantId, warehouse.id, dto, userId);
  }

  // ---- Own fulfillment warehouse ------------------------------------------------

  async getWarehouse(userId: string) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    return this.getOwnWarehouse(sellerId);
  }

  async updateWarehouse(userId: string, dto: UpdateWarehouseDto) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    const warehouse = await this.getOwnWarehouse(sellerId);
    return this.warehouses.update(warehouse.id, dto, userId);
  }

  // ---- Private -------------------------------------------------------------------

  private async assertOwnsProduct(sellerId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || product.deletedAt || product.sellerId !== sellerId) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product not found.',
      });
    }
  }

  private async assertOwnsVariant(sellerId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true },
    });
    if (
      !variant ||
      variant.deletedAt ||
      variant.product.sellerId !== sellerId
    ) {
      throw new NotFoundException({
        code: 'VARIANT_NOT_FOUND',
        message: 'Variant not found.',
      });
    }
  }

  private async getOwnWarehouse(sellerId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { sellerId },
      orderBy: { createdAt: 'asc' },
    });
    if (!warehouse) {
      // Only reachable if a seller is somehow verified without the
      // auto-provisioning step ever running (defensive, not expected in
      // normal operation — see SellersService.markVerified).
      throw new NotFoundException({
        code: 'SELLER_WAREHOUSE_NOT_FOUND',
        message: 'No fulfillment warehouse exists for your seller account yet.',
      });
    }
    return warehouse;
  }
}
