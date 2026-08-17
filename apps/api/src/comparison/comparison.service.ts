import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const compareInclude = {
  brand: true,
  category: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  specifications: { orderBy: { sortOrder: 'asc' as const } },
  variants: { where: { deletedAt: null, isActive: true } },
} satisfies Prisma.ProductInclude;

/**
 * Stateless by design: the frontend's compare tray (apps/web's compare page) is
 * local-only client state and stays that way — this endpoint just answers "given
 * these product IDs, here's a side-by-side spec table," with no server-side
 * persistence, matching what the reference UI already needs.
 */
@Injectable()
export class ComparisonService {
  constructor(private readonly prisma: PrismaService) {}

  async compare(ids: string[]) {
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, deletedAt: null, status: ProductStatus.ACTIVE },
      include: compareInclude,
    });

    if (products.length !== ids.length) {
      throw new BadRequestException({
        code: 'PRODUCT_NOT_COMPARABLE',
        message:
          'One or more products could not be found or are not available.',
      });
    }

    // Preserve the caller's requested order rather than the DB's arbitrary order.
    const ordered = ids.map((id) => products.find((p) => p.id === id)!);

    const specGroups = new Map<string, Set<string>>();
    for (const product of ordered) {
      for (const spec of product.specifications) {
        if (!specGroups.has(spec.group)) specGroups.set(spec.group, new Set());
        specGroups.get(spec.group)!.add(spec.key);
      }
    }

    const items = ordered.map((product) => {
      const prices = product.variants.map((v) => Number(v.price));
      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        brand: product.brand?.name ?? null,
        category: product.category.name,
        imageUrl:
          product.images.find((i) => i.isPrimary)?.url ??
          product.images[0]?.url ??
          null,
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
      };
    });

    const attributeMatrix = Array.from(specGroups.entries()).map(
      ([group, keys]) => ({
        group,
        rows: Array.from(keys).map((key) => ({
          key,
          values: ordered.map(
            (p) =>
              p.specifications.find((s) => s.group === group && s.key === key)
                ?.value ?? null,
          ),
        })),
      }),
    );

    return { items, attributeMatrix };
  }
}
