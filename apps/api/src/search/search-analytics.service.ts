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
      select: { query: true, resultCount: true, usedSemantic: true },
    });

    const total = rows.length;
    const zeroResultCount = rows.filter((r) => r.resultCount === 0).length;
    const semanticCount = rows.filter((r) => r.usedSemantic).length;

    const queryCounts = new Map<string, number>();
    const zeroResultQueryCounts = new Map<string, number>();
    for (const row of rows) {
      const normalized = row.query.trim().toLowerCase();
      if (!normalized) continue; // filter-only browsing, not a search term
      queryCounts.set(normalized, (queryCounts.get(normalized) ?? 0) + 1);
      if (row.resultCount === 0) {
        zeroResultQueryCounts.set(
          normalized,
          (zeroResultQueryCounts.get(normalized) ?? 0) + 1,
        );
      }
    }

    const topOf = (counts: Map<string, number>) =>
      [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, SEARCH_ANALYTICS_TOP_QUERIES_LIMIT)
        .map(([query, count]) => ({ query, count }));

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
