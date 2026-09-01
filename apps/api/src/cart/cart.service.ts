import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AddCartItemDto } from './dto/add-cart-item.dto';
import type { UpdateCartItemDto } from './dto/update-cart-item.dto';

const cartItemInclude = {
  variant: {
    include: {
      product: { include: { images: { where: { isPrimary: true }, take: 1 } } },
      attributeValues: {
        include: { attributeValue: { include: { attribute: true } } },
      },
      inventory: {
        select: {
          quantityOnHand: true,
          quantityReserved: true,
          quantityCommitted: true,
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

type CartItemRow = Prisma.CartItemGetPayload<{
  include: typeof cartItemInclude;
}>;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: cartItemInclude,
      orderBy: { createdAt: 'asc' },
    });
    return this.toCartResponse(cart.id, items);
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const variant = await this.assertVariantPurchasable(dto.variantId);
    const cart = await this.getOrCreateCart(userId);

    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
      create: {
        cartId: cart.id,
        variantId: variant.id,
        quantity: dto.quantity,
      },
      update: { quantity: { increment: dto.quantity } },
    });
    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const cart = await this.getOrCreateCart(userId);
    const existing = await this.assertItemOwnership(cart.id, itemId);

    if (dto.quantity <= 0) {
      await this.deleteItemIfCurrent(cart.id, itemId, existing.updatedAt);
    } else {
      const updated = await this.prisma.cartItem.updateMany({
        where: { id: itemId, cartId: cart.id, updatedAt: existing.updatedAt },
        data: { quantity: dto.quantity },
      });
      if (updated.count === 0) throw this.itemChanged();
    }
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.getOrCreateCart(userId);
    const existing = await this.assertItemOwnership(cart.id, itemId);
    await this.deleteItemIfCurrent(cart.id, itemId, existing.updatedAt);
    return this.getCart(userId);
  }

  async clear(userId: string): Promise<void> {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }

  async getOrCreateCart(userId: string) {
    return this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  private async assertItemOwnership(cartId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.cartId !== cartId) {
      throw new NotFoundException({
        code: 'CART_ITEM_NOT_FOUND',
        message: 'Cart item not found.',
      });
    }
    return item;
  }

  private async deleteItemIfCurrent(
    cartId: string,
    itemId: string,
    updatedAt: Date,
  ) {
    const deleted = await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cartId, updatedAt },
    });
    if (deleted.count === 0) throw this.itemChanged();
  }

  private itemChanged() {
    return new ConflictException({
      code: 'CART_ITEM_CHANGED',
      message: 'The cart item changed before this update could be applied.',
    });
  }

  private async assertVariantPurchasable(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true },
    });
    if (
      !variant ||
      variant.deletedAt ||
      !variant.isActive ||
      variant.product.deletedAt ||
      variant.product.status !== ProductStatus.ACTIVE
    ) {
      throw new BadRequestException({
        code: 'VARIANT_NOT_PURCHASABLE',
        message: 'This product is not currently available for purchase.',
      });
    }
    return variant;
  }

  private toCartResponse(cartId: string, items: CartItemRow[]) {
    const mapped = items.map((item) => {
      const variant = item.variant;
      const product = variant.product;
      const available =
        variant.inventory.reduce(
          (sum, row) =>
            sum +
            Math.max(
              0,
              row.quantityOnHand - row.quantityReserved - row.quantityCommitted,
            ),
          0,
        ) ?? 0;
      const isAvailable =
        !variant.deletedAt &&
        variant.isActive &&
        !product.deletedAt &&
        product.status === ProductStatus.ACTIVE;
      const unitPrice = Number(variant.price);

      return {
        id: item.id,
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        sku: variant.sku,
        imageUrl: product.images[0]?.url ?? null,
        unitPrice,
        currency: variant.currency,
        quantity: item.quantity,
        lineTotal: Number((unitPrice * item.quantity).toFixed(2)),
        availableQuantity: available,
        isAvailable,
        insufficientStock: isAvailable && available < item.quantity,
        attributes: variant.attributeValues.map((av) => ({
          attribute: av.attributeValue.attribute.name,
          value: av.attributeValue.value,
        })),
      };
    });

    const purchasableItems = mapped.filter(
      (item) => item.isAvailable && !item.insufficientStock,
    );

    return {
      id: cartId,
      items: mapped,
      itemCount: mapped.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: Number(
        purchasableItems
          .reduce((sum, item) => sum + item.lineTotal, 0)
          .toFixed(2),
      ),
      currency: mapped[0]?.currency ?? 'INR',
      hasUnavailableItems: mapped.some(
        (item) => !item.isAvailable || item.insufficientStock,
      ),
    };
  }
}
