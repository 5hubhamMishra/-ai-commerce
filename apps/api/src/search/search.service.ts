import { Inject, Injectable } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import type { SearchQueryDto, SearchSort } from './dto/search-query.dto';
import {
  QUERY_UNDERSTANDING_PROVIDER,
  type QueryUnderstandingProvider,
  type QueryUnderstandingResult,
} from './query-understanding/query-understanding.interface';
import { SearchAnalyticsService } from './search-analytics.service';
import {
  HYBRID_WEIGHTS,
  KEYWORD_CANDIDATE_LIMIT,
  SEMANTIC_CANDIDATE_LIMIT,
} from './search-config';

export type SearchIdentity = { userId?: string; anonymousId?: string };

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

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'for',
  'and',
  'or',
  'of',
  'in',
  'on',
  'with',
  'is',
  'are',
  'to',
  'good',
  'best',
  'nice',
  'great',
  'under',
  'over',
  'below',
  'above',
  'min',
  'max',
  'minimum',
  'maximum',
]);

/**
 * Customer-facing search — keyword/filter/sort when there's no free-text
 * query, hybrid (keyword + semantic + metadata filtering + query
 * understanding) when there is one. See DECISIONS.md ADR-024 for the
 * architecture and why it's split this way rather than one code path.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly analytics: SearchAnalyticsService,
    @Inject(QUERY_UNDERSTANDING_PROVIDER)
    private readonly queryUnderstanding: QueryUnderstandingProvider,
  ) {}

  async search(query: SearchQueryDto, identity: SearchIdentity = {}) {
    const q = query.q?.trim() || null;
    const result = q
      ? await this.hybridSearch(query, q, identity)
      : await this.keywordOnlySearch(query, identity);
    return result;
  }

  // ---- No free-text query: pure filter + sort, unchanged since Phase 3 -------

  private async keywordOnlySearch(
    query: SearchQueryDto,
    identity: SearchIdentity,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`p.deleted_at IS NULL`,
      Prisma.sql`p.status = 'ACTIVE'`,
      Prisma.sql`v.deleted_at IS NULL`,
      Prisma.sql`v.is_active = true`,
    ];
    if (query.category) {
      conditions.push(Prisma.sql`c.slug = ${query.category}`);
    }
    if (query.brand) {
      conditions.push(Prisma.sql`b.slug = ${query.brand}`);
    }

    if (query.minPrice !== undefined) {
      conditions.push(Prisma.sql`v.price >= ${query.minPrice}`);
    }
    if (query.maxPrice !== undefined) {
      conditions.push(Prisma.sql`v.price <= ${query.maxPrice}`);
    }

    const orderBy = buildOrderBy(query.sort, false, Prisma.sql`0`);

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
        ORDER BY ${orderBy}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `,
    );

    const total = rows[0]?.total_count ?? 0;
    const orderedIds = rows.map((r) => r.id);
    const items =
      orderedIds.length === 0
        ? []
        : await this.hydrate(orderedIds).then((byId) =>
            orderedIds
              .map((id) => byId.get(id))
              .filter((p): p is ProductRow => Boolean(p))
              .map(toSearchItem),
          );

    await this.analytics.logQuery({
      query: '',
      filters: {
        category: query.category ?? null,
        brand: query.brand ?? null,
        minPrice: query.minPrice ?? null,
        maxPrice: query.maxPrice ?? null,
        attributes: [],
      },
      resultCount: total,
      usedSemantic: false,
      userId: identity.userId,
      anonymousId: identity.anonymousId,
    });

    return { items, total, page, pageSize, understood: null };
  }

  // ---- Free-text query: query understanding + keyword + semantic + hybrid ---

  private async hybridSearch(
    query: SearchQueryDto,
    q: string,
    identity: SearchIdentity,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [categories, brands] = await Promise.all([
      this.prisma.category.findMany({
        where: { deletedAt: null, isActive: true },
        select: { slug: true, name: true },
      }),
      this.prisma.brand.findMany({
        where: { deletedAt: null, isActive: true },
        select: { slug: true, name: true },
      }),
    ]);

    const understood = this.queryUnderstanding.parse(q, { categories, brands });
    const textForMatching = understood.cleanedQuery || q;
    const tokens = significantTokens(textForMatching);

    const effective = {
      category: query.category ?? understood.category ?? undefined,
      brand: query.brand ?? understood.brand ?? undefined,
      minPrice: query.minPrice ?? understood.minPrice ?? undefined,
      maxPrice: query.maxPrice ?? understood.maxPrice ?? undefined,
    };

    const [keywordCandidates, semanticCandidates] = await Promise.all([
      this.keywordCandidates(tokens),
      this.embeddings.findSimilarToText(
        textForMatching,
        SEMANTIC_CANDIDATE_LIMIT,
      ),
    ]);
    const usedSemantic = semanticCandidates.length > 0;

    const keywordMap = new Map(
      keywordCandidates.map((r) => [r.id, r.relevance]),
    );
    const semanticMap = new Map(
      semanticCandidates.map((r) => [r.productId, r.similarity]),
    );
    const candidateIds = [
      ...new Set([...keywordMap.keys(), ...semanticMap.keys()]),
    ];

    let items: ReturnType<typeof toSearchItem>[] = [];
    let total = 0;

    if (candidateIds.length > 0) {
      const byId = await this.hydrate(candidateIds);

      const scored = [...byId.values()]
        .filter((p) => matchesMetadata(p, effective))
        .map((product) => {
          const keywordRaw = keywordMap.get(product.id) ?? 0;
          const keywordScore =
            tokens.length > 0 ? keywordRaw / (2 * tokens.length) : 0;
          const semanticRaw = semanticMap.get(product.id) ?? 0;
          const semanticScore = clamp01((semanticRaw + 1) / 2);
          const attributeMatches = understood.attributes.filter((attr) =>
            attributeMatchesProduct(product, attr),
          );
          const attributeScore =
            understood.attributes.length > 0
              ? attributeMatches.length / understood.attributes.length
              : 0;
          const hybridScore =
            HYBRID_WEIGHTS.keyword * keywordScore +
            HYBRID_WEIGHTS.semantic * semanticScore +
            HYBRID_WEIGHTS.attributes * attributeScore;
          return { product, hybridScore };
        });

      const ordered =
        query.sort && query.sort !== 'relevance'
          ? [...scored].sort((a, b) =>
              compareBySort(a.product, b.product, query.sort as SearchSort),
            )
          : [...scored].sort((a, b) => b.hybridScore - a.hybridScore);

      total = ordered.length;
      const start = (page - 1) * pageSize;
      items = ordered
        .slice(start, start + pageSize)
        .map(({ product }) => toSearchItem(product));
    }

    await this.analytics.logQuery({
      query: q,
      filters: {
        category: effective.category ?? null,
        brand: effective.brand ?? null,
        minPrice: effective.minPrice ?? null,
        maxPrice: effective.maxPrice ?? null,
        attributes: understood.attributes,
      },
      resultCount: total,
      usedSemantic,
      userId: identity.userId,
      anonymousId: identity.anonymousId,
    });

    return {
      items,
      total,
      page,
      pageSize,
      understood: toUnderstoodResponse(understood),
    };
  }

  private async keywordCandidates(
    tokens: string[],
  ): Promise<{ id: string; relevance: number }[]> {
    if (tokens.length === 0) return [];

    const tokenExprs = tokens.map(
      (t) =>
        Prisma.sql`CASE WHEN p.name ILIKE ${`%${t}%`} THEN 2 WHEN p.description ILIKE ${`%${t}%`} THEN 1 ELSE 0 END`,
    );
    const relevanceSum = Prisma.join(tokenExprs, ' + ');
    const matchConditions = tokens.map(
      (t) =>
        Prisma.sql`(p.name ILIKE ${`%${t}%`} OR p.description ILIKE ${`%${t}%`})`,
    );

    return this.prisma.$queryRaw<{ id: string; relevance: number }[]>(
      Prisma.sql`
        SELECT p.id, MAX(${relevanceSum})::int AS relevance
        FROM products p
        JOIN product_variants v ON v.product_id = p.id
        WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE'
          AND v.deleted_at IS NULL AND v.is_active = true
          AND (${Prisma.join(matchConditions, ' OR ')})
        GROUP BY p.id
        ORDER BY relevance DESC
        LIMIT ${KEYWORD_CANDIDATE_LIMIT}
      `,
    );
  }

  private async hydrate(ids: string[]): Promise<Map<string, ProductRow>> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, deletedAt: null, status: ProductStatus.ACTIVE },
      include: detailInclude,
    });
    return new Map(products.map((p) => [p.id, p]));
  }
}

function significantTokens(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return [...new Set(tokens)];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function minVariantPrice(p: ProductRow): number {
  const prices = p.variants.map((v) => Number(v.price));
  return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
}

export function matchesMetadata(
  p: ProductRow,
  effective: {
    category?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
  },
): boolean {
  if (p.variants.length === 0) return false;
  if (effective.category && p.category.slug !== effective.category)
    return false;
  if (effective.brand && p.brand?.slug !== effective.brand) return false;
  return p.variants.some((variant) => {
    const price = Number(variant.price);
    return (
      (effective.minPrice === undefined || price >= effective.minPrice) &&
      (effective.maxPrice === undefined || price <= effective.maxPrice)
    );
  });
}

function attributeMatchesProduct(p: ProductRow, attribute: string): boolean {
  const haystack = `${p.name} ${p.description}`.toLowerCase();
  return haystack.includes(attribute);
}

function compareBySort(a: ProductRow, b: ProductRow, sort: SearchSort): number {
  switch (sort) {
    case 'price_asc':
      return minVariantPrice(a) - minVariantPrice(b);
    case 'price_desc':
      return minVariantPrice(b) - minVariantPrice(a);
    case 'name_asc':
      return a.name.localeCompare(b.name);
    case 'newest':
    default:
      return b.createdAt.getTime() - a.createdAt.getTime();
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

function toUnderstoodResponse(u: QueryUnderstandingResult) {
  return {
    category: u.category,
    brand: u.brand,
    minPrice: u.minPrice,
    maxPrice: u.maxPrice,
    attributes: u.attributes,
  };
}
