import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus, type Product } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CACHE_PREFIX } from '../common/cache/cache-keys';
import { CacheService } from '../common/cache/cache.service';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { slugify } from '../common/utils/slugify';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProductDto } from './dto/create-product.dto';
import type { ListProductsQueryDto } from './dto/list-products-query.dto';
import type { UpdateProductDto } from './dto/update-product.dto';

const LIST_CACHE_TTL_SECONDS = 60;
const DETAIL_CACHE_TTL_SECONDS = 120;

const variantInclude = {
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
} satisfies Prisma.ProductVariantInclude;

const detailInclude = {
  category: true,
  brand: true,
  seller: { select: { id: true, slug: true, businessName: true } },
  variants: { where: { deletedAt: null }, include: variantInclude },
  images: { orderBy: { sortOrder: 'asc' as const } },
  specifications: { orderBy: { sortOrder: 'asc' as const } },
  tags: { include: { tag: true } },
} satisfies Prisma.ProductInclude;

type ProductDetailRow = Prisma.ProductGetPayload<{
  include: typeof detailInclude;
}>;

type ProductReviewSummary = {
  average: number | null;
  count: number;
};

type ProductReviewSummaryDelegate = {
  groupBy(args: {
    by: ['productId'];
    where: { productId: { in: string[] } };
    _avg: { rating: true };
    _count: { _all: true };
  }): Promise<
    {
      productId: string;
      _avg: { rating: number | null };
      _count: { _all: number };
    }[]
  >;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly events: CatalogEventsService,
    private readonly audit: AuditService,
  ) {}

  // ---- Reads -------------------------------------------------------------

  // `sellerId` (Phase 5): undefined scopes across the whole catalog (the
  // existing behavior, unchanged); set scopes to one seller's storefront
  // (public, e.g. GET /sellers/:slug/products) or their own admin catalog
  // view (SellerCatalogController), reusing this same method either way.
  async listPublic(query: ListProductsQueryDto, sellerId?: string) {
    return this.list(query, {
      status: ProductStatus.ACTIVE,
      activeOnly: true,
      sellerId,
    });
  }

  async listAdmin(query: ListProductsQueryDto, sellerId?: string) {
    return this.list(query, {
      status: query.status,
      activeOnly: false,
      sellerId,
    });
  }

  private async list(
    query: ListProductsQueryDto,
    scope: { status?: ProductStatus; activeOnly: boolean; sellerId?: string },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const cacheKey = `${CACHE_PREFIX.PRODUCTS}list:${JSON.stringify({ query, scope })}`;

    if (scope.activeOnly) {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(scope.status ? { status: scope.status } : {}),
      ...(scope.sellerId ? { sellerId: scope.sellerId } : {}),
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.brand ? { brand: { slug: query.brand } } : {}),
      ...(query.tag ? { tags: { some: { tag: { slug: query.tag } } } } : {}),
      ...(query.featured !== undefined ? { isFeatured: query.featured } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            variants: {
              some: {
                deletedAt: null,
                isActive: true,
                ...(query.minPrice !== undefined
                  ? { price: { gte: query.minPrice } }
                  : {}),
                ...(query.maxPrice !== undefined
                  ? { price: { lte: query.maxPrice } }
                  : {}),
              },
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: detailInclude,
        orderBy: sortToOrderBy(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    const reviewSummaries = await this.getReviewSummaries(
      rows.map((row) => row.id),
    );

    const result = {
      items: rows.map((row) => toListItem(row, reviewSummaries.get(row.id))),
      total,
      page,
      pageSize,
    };

    if (scope.activeOnly) {
      await this.cache.set(cacheKey, result, LIST_CACHE_TTL_SECONDS);
    }
    return result;
  }

  async findBySlugPublic(slug: string) {
    const cacheKey = `${CACHE_PREFIX.PRODUCTS}detail:${slug}`;
    const cached = await this.cache.get<ReturnType<typeof toDetail>>(cacheKey);
    if (cached) return cached;

    const product = await this.prisma.product.findFirst({
      where: { slug, deletedAt: null, status: ProductStatus.ACTIVE },
      include: detailInclude,
    });
    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product not found.',
      });
    }
    const reviewSummaries = await this.getReviewSummaries([product.id]);
    const detail = toDetail(product, reviewSummaries.get(product.id));
    await this.cache.set(cacheKey, detail, DETAIL_CACHE_TTL_SECONDS);
    return detail;
  }

  async findByIdAdmin(id: string) {
    const product = await this.getRowById(id);
    const reviewSummaries = await this.getReviewSummaries([product.id]);
    return toDetail(product, reviewSummaries.get(product.id));
  }

  /** Lightweight hydration for a list of product IDs — used by ShopAI's
   *  recommendations tool (Phase 9), which gets bare `{productId, score,
   *  reasons}` back from RecommendationsService and needs real name/price/
   *  slug to describe results to a customer, not just UUIDs. Deliberately
   *  not `findBySlugPublic`'s full detail shape (variants/images/specs) —
   *  this is a summary list, not a product page. */
  async findSummariesByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, deletedAt: null, status: ProductStatus.ACTIVE },
      include: {
        variants: { where: { deletedAt: null, isActive: true } },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => {
        const prices = p.variants.map((v) => Number(v.price));
        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          minPrice: prices.length ? Math.min(...prices) : null,
          maxPrice: prices.length ? Math.max(...prices) : null,
        };
      });
  }

  async getRowById(id: string): Promise<ProductDetailRow> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!product || product.deletedAt) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product not found.',
      });
    }
    return product;
  }

  // ---- Writes --------------------------------------------------------------

  // `sellerId` (Phase 5) is undefined for the existing admin catalog path
  // (ProductsController) — behavior there is byte-for-byte unchanged. Only
  // the seller-catalog path (SellerCatalogController) ever passes one, and
  // always its caller's own seller id, never a client-supplied value.
  async create(dto: CreateProductDto, actorId: string, sellerId?: string) {
    await this.assertCategoryExists(dto.categoryId);
    if (dto.brandId) await this.assertBrandExists(dto.brandId);

    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    await this.assertSlugAvailable(slug);

    let product: Product;
    try {
      product = await this.prisma.product.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          categoryId: dto.categoryId,
          brandId: dto.brandId,
          sellerId,
          status: dto.status ?? ProductStatus.DRAFT,
          isFeatured: dto.isFeatured ?? false,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'PRODUCT_SLUG_TAKEN',
          message: 'A product with this slug already exists.',
        });
      }
      throw error;
    }

    await this.audit.record({
      actorId,
      action: 'PRODUCT_CREATED',
      entityType: 'product',
      entityId: product.id,
      metadata: { name: product.name, slug: product.slug },
    });
    this.events.productChanged(product.id, 'created');
    return this.findByIdAdmin(product.id);
  }

  async update(id: string, dto: UpdateProductDto, actorId: string) {
    const existing = await this.getRowById(id);
    if (dto.categoryId) await this.assertCategoryExists(dto.categoryId);
    if (dto.brandId) await this.assertBrandExists(dto.brandId);
    const slug = dto.slug ? slugify(dto.slug) : undefined;
    if (slug) await this.assertSlugAvailable(slug, id);

    try {
      const claimed = await this.prisma.product.updateMany({
        where: { id, updatedAt: existing.updatedAt },
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          categoryId: dto.categoryId,
          brandId: dto.brandId,
          status: dto.status,
          isFeatured: dto.isFeatured,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: 'PRODUCT_CHANGED',
          message: 'The product changed before this update could be applied.',
        });
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'PRODUCT_SLUG_TAKEN',
          message: 'A product with this slug already exists.',
        });
      }
      throw error;
    }

    await this.audit.record({
      actorId,
      action: 'PRODUCT_UPDATED',
      entityType: 'product',
      entityId: id,
      metadata: dto as Record<string, unknown>,
    });
    this.events.productChanged(id, 'updated');
    return this.findByIdAdmin(id);
  }

  async remove(id: string, actorId: string): Promise<void> {
    const existing = await this.getRowById(id);
    const claimed = await this.prisma.product.updateMany({
      where: { id, updatedAt: existing.updatedAt },
      data: { deletedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: 'PRODUCT_CHANGED',
        message: 'The product changed before deletion could be applied.',
      });
    }

    await this.audit.record({
      actorId,
      action: 'PRODUCT_DELETED',
      entityType: 'product',
      entityId: id,
    });
    this.events.productChanged(id, 'deleted');
  }

  // ---- Shared guards used by the variant/image/spec sub-resource services ---

  async assertCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.deletedAt) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'The specified category does not exist.',
      });
    }
  }

  async assertBrandExists(brandId: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
    });
    if (!brand || brand.deletedAt) {
      throw new NotFoundException({
        code: 'BRAND_NOT_FOUND',
        message: 'The specified brand does not exist.',
      });
    }
  }

  private async assertSlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.product.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId && !existing.deletedAt) {
      throw new ConflictException({
        code: 'PRODUCT_SLUG_TAKEN',
        message: 'A product with this slug already exists.',
      });
    }
  }

  private async getReviewSummaries(productIds: string[]) {
    if (productIds.length === 0) {
      return new Map<string, ProductReviewSummary>();
    }

    const rows = await this.productReviews.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _avg: { rating: true },
      _count: { _all: true },
    });

    return new Map(
      rows.map((row) => [
        row.productId,
        {
          average: row._avg.rating ?? null,
          count: row._count._all,
        },
      ]),
    );
  }

  private get productReviews(): ProductReviewSummaryDelegate {
    return (
      this.prisma as unknown as { productReview: ProductReviewSummaryDelegate }
    ).productReview;
  }
}

function sortToOrderBy(
  sort?: string,
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'name_asc':
      return [{ name: 'asc' }];
    case 'featured':
      return [{ isFeatured: 'desc' }, { createdAt: 'desc' }];
    case 'newest':
    default:
      return [{ createdAt: 'desc' }];
  }
}

function availableQuantity(
  inventory: {
    quantityOnHand: number;
    quantityReserved: number;
    quantityCommitted: number;
  }[],
) {
  return inventory.reduce(
    (sum, row) =>
      sum +
      Math.max(
        0,
        row.quantityOnHand - row.quantityReserved - row.quantityCommitted,
      ),
    0,
  );
}

function mapVariant(variant: ProductDetailRow['variants'][number]) {
  return {
    id: variant.id,
    sku: variant.sku,
    price: Number(variant.price),
    compareAtPrice: variant.compareAtPrice
      ? Number(variant.compareAtPrice)
      : null,
    currency: variant.currency,
    weightGrams: variant.weightGrams,
    isDefault: variant.isDefault,
    isActive: variant.isActive,
    availableQuantity: availableQuantity(variant.inventory),
    attributes: variant.attributeValues.map((av) => ({
      attribute: av.attributeValue.attribute.name,
      attributeSlug: av.attributeValue.attribute.slug,
      value: av.attributeValue.value,
      valueSlug: av.attributeValue.slug,
    })),
  };
}

function toListItem(product: ProductDetailRow, summary?: ProductReviewSummary) {
  const activeVariants = product.variants.filter((v) => v.isActive);
  const prices = activeVariants.map((v) => Number(v.price));
  const primaryImage =
    product.images.find((img) => img.isPrimary) ?? product.images[0];
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    status: product.status,
    isFeatured: product.isFeatured,
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
    },
    brand: product.brand
      ? {
          id: product.brand.id,
          name: product.brand.name,
          slug: product.brand.slug,
        }
      : null,
    // Phase 5: null for a platform-owned product — customers browsing today's
    // catalog see no difference at all, per the spec's "purchase without
    // being aware of unnecessary internal marketplace complexity" guidance.
    seller: product.seller
      ? {
          id: product.seller.id,
          slug: product.seller.slug,
          businessName: product.seller.businessName,
        }
      : null,
    currency: activeVariants[0]?.currency ?? 'INR',
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    primaryImageUrl: primaryImage?.url ?? null,
    inStock: activeVariants.some((v) => availableQuantity(v.inventory) > 0),
    rating: summary?.average ?? null,
    reviewCount: summary?.count ?? 0,
  };
}

function toDetail(product: ProductDetailRow, summary?: ProductReviewSummary) {
  return {
    ...toListItem(product, summary),
    description: product.description,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    variants: product.variants.map(mapVariant),
    images: product.images.map((img) => ({
      id: img.id,
      url: img.url,
      altText: img.altText,
      variantId: img.variantId,
      sortOrder: img.sortOrder,
      isPrimary: img.isPrimary,
    })),
    specifications: product.specifications.map((spec) => ({
      id: spec.id,
      group: spec.group,
      key: spec.key,
      value: spec.value,
      sortOrder: spec.sortOrder,
    })),
    tags: product.tags.map((t) => t.tag.name),
  };
}
