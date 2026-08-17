import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SearchQueryDto, SearchSort } from './dto/search-query.dto';

const detailInclude = {
  category: true,
  brand: true,
  variants: {
    where: { deletedAt: null, isActive: true },
    include: {
      inventory: {
        select: {
          quantityOnHand: true,
          quantityReserved: true,
          quantityCommitted: true,
        },
      },
    },
  },
  images: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

/**
 * Customer-facing keyword/filter/sort search (spec: "search foundation, filters,
 * sorting" — explicitly NOT semantic search, that's Phase 8). Separate from
 * ProductsService.listPublic() because it needs price-sorting, which requires
 * aggregating MIN(price) across a product's variants — something Prisma's
 * relational query API can't express as an ORDER BY, but raw SQL can (the same
 * "raw SQL where the ORM can't reach" precedent already used for pgvector work).
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const q = query.q?.trim() || null;
    const likePattern = q ? `%${q}%` : null;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`p.deleted_at IS NULL`,
      Prisma.sql`p.status = 'ACTIVE'`,
      Prisma.sql`v.deleted_at IS NULL`,
      Prisma.sql`v.is_active = true`,
    ];
    if (likePattern) {
      conditions.push(
        Prisma.sql`(p.name ILIKE ${likePattern} OR p.description ILIKE ${likePattern})`,
      );
    }
    if (query.category) {
      conditions.push(Prisma.sql`c.slug = ${query.category}`);
    }
    if (query.brand) {
      conditions.push(Prisma.sql`b.slug = ${query.brand}`);
    }

    const havingConditions: Prisma.Sql[] = [];
    if (query.minPrice !== undefined) {
      havingConditions.push(Prisma.sql`MIN(v.price) >= ${query.minPrice}`);
    }
    if (query.maxPrice !== undefined) {
      havingConditions.push(Prisma.sql`MIN(v.price) <= ${query.maxPrice}`);
    }
    const havingClause = havingConditions.length
      ? Prisma.sql`HAVING ${Prisma.join(havingConditions, ' AND ')}`
      : Prisma.empty;

    const relevanceExpr = likePattern
      ? Prisma.sql`(CASE WHEN p.name ILIKE ${likePattern} THEN 2 WHEN p.description ILIKE ${likePattern} THEN 1 ELSE 0 END)`
      : Prisma.sql`0`;
    const orderBy = buildOrderBy(query.sort, Boolean(q), relevanceExpr);

    const rows = await this.prisma.$queryRaw<
      { id: string; total_count: number }[]
    >(
      Prisma.sql`
        SELECT p.id, COUNT(*) OVER()::int AS total_count
        FROM products p
        JOIN product_variants v ON v.product_id = p.id
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN brands b ON b.id = p.brand_id
        WHERE ${Prisma.join(conditions, ' AND ')}
        GROUP BY p.id
        ${havingClause}
        ORDER BY ${orderBy}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `,
    );

    const total = rows[0]?.total_count ?? 0;
    const orderedIds = rows.map((r) => r.id);
    if (orderedIds.length === 0) {
      return { items: [], total, page, pageSize };
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: orderedIds } },
      include: detailInclude,
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return {
      items: orderedIds
        .map((id) => byId.get(id))
        .filter((p): p is ProductRow => Boolean(p))
        .map(toSearchItem),
      total,
      page,
      pageSize,
    };
  }
}

function buildOrderBy(
  sort: SearchSort | undefined,
  hasQuery: boolean,
  relevanceExpr: Prisma.Sql,
): Prisma.Sql {
  const effective = sort ?? (hasQuery ? 'relevance' : 'newest');
  switch (effective) {
    case 'price_asc':
      return Prisma.sql`MIN(v.price) ASC`;
    case 'price_desc':
      return Prisma.sql`MIN(v.price) DESC`;
    case 'name_asc':
      return Prisma.sql`MIN(p.name) ASC`;
    case 'relevance':
      return Prisma.sql`${relevanceExpr} DESC, MIN(p.created_at) DESC`;
    case 'newest':
    default:
      return Prisma.sql`MIN(p.created_at) DESC`;
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

function toSearchItem(product: ProductRow) {
  const prices = product.variants.map((v) => Number(v.price));
  const primaryImage =
    product.images.find((img) => img.isPrimary) ?? product.images[0];
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
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
    currency: product.variants[0]?.currency ?? 'INR',
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    primaryImageUrl: primaryImage?.url ?? null,
    inStock: product.variants.some((v) => availableQuantity(v.inventory) > 0),
  };
}
