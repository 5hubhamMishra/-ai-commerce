import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SEARCH_ANALYTICS_TOP_QUERIES_LIMIT } from './search-config';
import { SearchAnalyticsService } from './search-analytics.service';

describe('SearchAnalyticsService', () => {
  let service: SearchAnalyticsService;
  let prisma: { searchQueryLog: { findMany: jest.Mock; create: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      searchQueryLog: { findMany: jest.fn(), create: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [
        SearchAnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(SearchAnalyticsService);
  });

  const row = (
    query: string,
    resultCount: number,
    daysAgo: number,
  ) => ({
    query,
    resultCount,
    usedSemantic: false,
    createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
  });

  it('ranks by count descending', async () => {
    prisma.searchQueryLog.findMany.mockResolvedValue([
      row('a', 0, 1),
      row('b', 0, 1),
      row('b', 0, 1),
    ]);
    const report = await service.getReport();
    expect(report.topZeroResultQueries).toEqual([
      { query: 'b', count: 2 },
      { query: 'a', count: 1 },
    ]);
  });

  // The real bug this test guards against: analytics log rows accumulate
  // indefinitely by design (never cleaned up — see search.e2e-spec.ts's own
  // afterAll comment), so once more distinct queries exist than the top-N
  // limit, a count-only sort leaves ties broken by whatever order the
  // database happened to return rows in — silently dropping the newest,
  // most actionable queries in favor of stale ones from weeks earlier.
  it('breaks ties in favor of the most recently seen query, not scan order', async () => {
    const rows = [];
    // One more single-occurrence query than the top-N limit allows, oldest first —
    // if ties were broken by scan/insertion order, the newest one below would be
    // the one single query pushed out of the top N.
    for (let i = 0; i < SEARCH_ANALYTICS_TOP_QUERIES_LIMIT; i++) {
      rows.push(row(`stale-query-${i}`, 0, 30 - i));
    }
    rows.push(row('brand-new-query', 0, 0));
    prisma.searchQueryLog.findMany.mockResolvedValue(rows);

    const report = await service.getReport();
    expect(report.topZeroResultQueries).toHaveLength(
      SEARCH_ANALYTICS_TOP_QUERIES_LIMIT,
    );
    expect(
      report.topZeroResultQueries.some((r) => r.query === 'brand-new-query'),
    ).toBe(true);
  });

  it('normalizes query casing/whitespace and excludes empty (filter-only) queries from the ranked lists', async () => {
    prisma.searchQueryLog.findMany.mockResolvedValue([
      row('  Headphones  ', 0, 1),
      row('headphones', 0, 1),
      row('', 0, 1),
      row('   ', 5, 1),
    ]);
    const report = await service.getReport();
    // totalSearches counts every request, including empty-query filter/browse
    // traffic (spec comment: "how much search traffic is there at all" matters
    // too) — only the *ranked query lists* exclude the empty-query rows.
    expect(report.totalSearches).toBe(4);
    expect(report.topZeroResultQueries).toEqual([{ query: 'headphones', count: 2 }]);
  });
});
