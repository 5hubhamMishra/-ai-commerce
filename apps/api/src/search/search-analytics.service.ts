import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SEARCH_ANALYTICS_LOOKBACK_DAYS,
  SEARCH_ANALYTICS_TOP_QUERIES_LIMIT,
} from './search-config';

export type LoggedSearchFilters = {
  category: string | null;
  brand: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  attributes: string[];
};

export type SearchAnalyticsReport = {
  windowDays: number;
  /** Every search request, including empty-query filter/browse requests —
   *  "how much search traffic is there at all" is itself part of the
   *  analytics picture, not just natural-language query volume. */
  totalSearches: number;
  zeroResultSearches: number;
  zeroResultRate: number;
  /** Share of requests where the semantic (pgvector) path actually
   *  contributed candidates — degrades toward 0 if the vector path is ever
   *  failing, which is itself a useful signal (see EmbeddingsService's
   *  graceful-degradation fallback). */
  semanticUsageRate: number;
  topQueries: { query: string; count: number }[];
  /** Queries that found nothing — the single most actionable search
   *  analytics report: gaps in the catalog or the query-understanding
   *  vocabulary. */
  topZeroResultQueries: { query: string; count: number }[];
};

/** Logs every search request and reports on the log — the spec's "search
 *  analytics" bullet. Logging is deliberately best-effort: a logging
 *  failure must never turn into a 500 for a customer who's just trying to
 *  search, so `logQuery` swallows its own errors rather than propagating
 *  them into SearchService's request path. */
@Injectable()
export class SearchAnalyticsService {
  private readonly logger = new Logger(SearchAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logQuery(params: {
    query: string;
    filters: LoggedSearchFilters;
    resultCount: number;
    usedSemantic: boolean;
    userId?: string;
    anonymousId?: string;
  }): Promise<void> {
    try {
      await this.prisma.searchQueryLog.create({
        data: {
          query: params.query,
          filters: params.filters,
          resultCount: params.resultCount,
          usedSemantic: params.usedSemantic,
          userId: params.userId,
          anonymousId: params.anonymousId,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to log search analytics: ${String(error)}`);
    }
  }

  async getReport(
    windowDays = SEARCH_ANALYTICS_LOOKBACK_DAYS,
  ): Promise<SearchAnalyticsReport> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.searchQueryLog.findMany({
      where: { createdAt: { gte: since } },
      select: { query: true, resultCount: true, usedSemantic: true, createdAt: true },
    });

    const total = rows.length;
    const zeroResultCount = rows.filter((r) => r.resultCount === 0).length;
    const semanticCount = rows.filter((r) => r.usedSemantic).length;

    // Tracks last-seen time per query alongside its count — analytics log rows
    // accumulate indefinitely by design (never cleaned up, real history, same
    // as product_embeddings), so once more distinct queries exist than the
    // top-N limit, count-only sorting leaves ties broken by arbitrary row-scan
    // order. That silently drops the newest (most actionable) queries in favor
    // of however the database happened to return older ones first.
    const queryCounts = new Map<string, { count: number; lastSeenAt: Date }>();
    const zeroResultQueryCounts = new Map<string, { count: number; lastSeenAt: Date }>();
    const bump = (
      counts: Map<string, { count: number; lastSeenAt: Date }>,
      query: string,
      occurredAt: Date,
    ) => {
      const existing = counts.get(query);
      counts.set(query, {
        count: (existing?.count ?? 0) + 1,
        lastSeenAt: existing && existing.lastSeenAt > occurredAt ? existing.lastSeenAt : occurredAt,
      });
    };
    for (const row of rows) {
      const normalized = row.query.trim().toLowerCase();
      if (!normalized) continue; // filter-only browsing, not a search term
      bump(queryCounts, normalized, row.createdAt);
      if (row.resultCount === 0) {
        bump(zeroResultQueryCounts, normalized, row.createdAt);
      }
    }

    const topOf = (counts: Map<string, { count: number; lastSeenAt: Date }>) =>
      [...counts.entries()]
        .sort(
          (a, b) =>
            b[1].count - a[1].count ||
            b[1].lastSeenAt.getTime() - a[1].lastSeenAt.getTime(),
        )
        .slice(0, SEARCH_ANALYTICS_TOP_QUERIES_LIMIT)
        .map(([query, { count }]) => ({ query, count }));

    return {
      windowDays,
      totalSearches: total,
      zeroResultSearches: zeroResultCount,
      zeroResultRate: total > 0 ? zeroResultCount / total : 0,
      semanticUsageRate: total > 0 ? semanticCount / total : 0,
      topQueries: topOf(queryCounts),
      topZeroResultQueries: topOf(zeroResultQueryCounts),
    };
  }
}
