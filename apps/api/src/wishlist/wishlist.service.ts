import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const wishlistItemInclude = {
  product: {
    include: {
      images: { where: { isPrimary: true }, take: 1 },
      variants: { where: { deletedAt: null, isActive: true } },
      brand: true,
    },
  },
} satisfies Prisma.WishlistItemInclude;

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      include: wishlistItemInclude,
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: items.map((item) => {
        const prices = item.product.variants.map((v) => Number(v.price));
        return {
          productId: item.product.id,
          slug: item.product.slug,
          name: item.product.name,
          brand: item.product.brand?.name ?? null,
          status: item.product.status,
          imageUrl: item.product.images[0]?.url ?? null,
          minPrice: prices.length ? Math.min(...prices) : null,
          maxPrice: prices.length ? Math.max(...prices) : null,
          isAvailable:
            !item.product.deletedAt &&
            item.product.status === ProductStatus.ACTIVE &&
            prices.length > 0,
          addedAt: item.createdAt,
        };
      }),
    };
  }

  /** Idempotent by design — adding an already-wishlisted product is a no-op success. */
  async add(userId: string, productId: string) {
    await this.assertProductExists(productId);
    await this.prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
    return this.list(userId);
  }

  async remove(userId: string, productId: string) {
    await this.prisma.wishlistItem
      .delete({ where: { userId_productId: { userId, productId } } })
      .catch(() => undefined); // removing something already absent is a no-op success
    return this.list(userId);
  }

  private async assertProductExists(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || product.deletedAt) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product not found.',
      });
    }
  }
}
