import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ProductStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type ScoredProductBody = {
  productId: string;
  score: number;
  reasons: string[];
};

/**
 * Exercises Phase 7 (AI Recommendations) end to end against the real
 * database and the real, already-seeded catalog: admin-triggered embedding
 * reindexing, content-based similarity, trending, frequently-bought-with
 * (including its cold-start compatibility fallback), the full personalized
 * hybrid pipeline driven by real tracked behavior, recommendation-impression
 * logging, the offline evaluation endpoint (coverage/engagement/backtest),
 * and RBAC on the two admin routes.
 *
 * Does not fabricate paid-order co-purchase history — that path was already
 * live-verified manually (see docs/PROJECT_PROGRESS.md Phase 7 entry).
 * `getFrequentlyBoughtWith` is asserted structurally instead of assuming a
 * specific real/fallback mix, since another suite running concurrently
 * against this shared dev database could legitimately hold open paid orders
 * at the same time this file runs.
 */
describe('AI Recommendations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now();

  const adminEmail = `e2e-rec-admin-${run}@example.com`;
  const analystEmail = `e2e-rec-analyst-${run}@example.com`;
  const customerEmail = `e2e-rec-customer-${run}@example.com`;

  let adminToken: string;
  let analystToken: string;
  let customerToken: string;
  let customerId: string;

  const userIds: string[] = [];
  const sessionIds: string[] = [];
  const anonymousIds: string[] = [];

  const nextEventId = () => randomUUID();
  const now = () => new Date().toISOString();

  async function trackEvent(
    token: string | undefined,
    eventType: string,
    entityId: string,
    anonymousId: string,
    sessionId: string,
  ) {
    const req = request(app.getHttpServer()).post('/api/v1/events');
    if (token) req.set('Authorization', `Bearer ${token}`);
    await req
      .send({
        events: [
          {
            eventId: nextEventId(),
            eventType,
            anonymousId,
            sessionId,
            source: 'WEB',
            entityId,
            occurredAt: now(),
          },
        ],
      })
      .expect(202);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await bcrypt.hash('password123', 4);
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: 'E2E Recommendations Admin',
        roles: { create: [{ role: Role.ADMIN }] },
      },
    });
    userIds.push(admin.id);
    const analyst = await prisma.user.create({
      data: {
        email: analystEmail,
        passwordHash,
        name: 'E2E Recommendations Analyst',
        roles: { create: [{ role: Role.ANALYST }] },
      },
    });
    userIds.push(analyst.id);

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'password123' })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    const analystLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: analystEmail, password: 'password123' })
      .expect(200);
    analystToken = analystLogin.body.accessToken;

    const customerRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: customerEmail,
        password: 'password123',
        name: 'E2E Recommendations Customer',
      })
      .expect(201);
    customerToken = customerRegister.body.accessToken;
    customerId = customerRegister.body.user.id;
    userIds.push(customerId);
  });

  afterAll(async () => {
    // FK order matters: RecommendationImpression/BehavioralEvent are
    // RESTRICT-by-default history tables (never CASCADE-deleted away), so
    // they must be cleared before the users/sessions they reference.
    await prisma.recommendationImpression
      .deleteMany({
        where: {
          OR: [
            { userId: { in: userIds } },
            { anonymousId: { in: anonymousIds } },
          ],
        },
      })
      .catch(() => undefined);
    await prisma.behavioralEvent
      .deleteMany({
        where: {
          OR: [
            { userId: { in: userIds } },
            { anonymousId: { in: anonymousIds } },
          ],
        },
      })
      .catch(() => undefined);
    await prisma.customerProfile
      .deleteMany({
        where: {
          OR: [
            { userId: { in: userIds } },
            { anonymousId: { in: anonymousIds } },
          ],
        },
      })
      .catch(() => undefined);
    await prisma.session
      .deleteMany({ where: { id: { in: sessionIds } } })
      .catch(() => undefined);
    await prisma.user
      .deleteMany({ where: { id: { in: userIds } } })
      .catch(() => undefined);
    // Deliberately NOT deleting product_embeddings — they're real, reusable
    // computed catalog state (see EmbeddingsService doc comment), not test
    // pollution, exactly like every prior live-verification pass this phase.
    await app.close();
  });

  // ---- Admin: embedding reindex, and RBAC on both admin routes ------------------

  it('rejects embedding reindex from a non-admin caller', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/recommendations/admin/reindex-embeddings')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('reindexes real embeddings for the whole purchasable catalog as an admin', async () => {
    const activeCount = await prisma.product.count({
      where: { status: ProductStatus.ACTIVE, deletedAt: null },
    });
    expect(activeCount).toBeGreaterThan(0);

    const res = await request(app.getHttpServer())
      .post('/api/v1/recommendations/admin/reindex-embeddings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    // Not toBe: reindexAll() counts every non-deleted product (any status,
    // not just ACTIVE — see EmbeddingsService.reindexAll), and other e2e
    // suites create/delete their own products concurrently against this
    // shared dev database (Jest runs spec files in parallel workers by
    // default). >= activeCount is the real invariant; exact equality was
    // never guaranteed and only looked that way before another suite's
    // fixtures made the race visible.
    expect(res.body.productCount).toBeGreaterThanOrEqual(activeCount);

    const embeddingCount = await prisma.productEmbedding.count();
    expect(embeddingCount).toBeGreaterThanOrEqual(activeCount);
  });

  // ---- Content-based similarity -------------------------------------------------

  it('returns real content-based similar products, skewed toward the same category', async () => {
    const category = await prisma.category.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
        products: { some: { status: ProductStatus.ACTIVE, deletedAt: null } },
      },
      include: {
        products: {
          where: { status: ProductStatus.ACTIVE, deletedAt: null },
          take: 5,
        },
      },
      orderBy: { products: { _count: 'desc' } },
    });
    expect(category).toBeTruthy();
    const anchor = category!.products[0];
    expect(anchor).toBeTruthy();

    const anonymousId = `anon-similar-${run}`;
    anonymousIds.push(anonymousId);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/recommendations/similar/${anchor.id}`)
      .query({ limit: 5, anonymousId })
      .expect(200);

    const body = res.body as ScoredProductBody[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(5);
    for (const item of body) {
      expect(item.productId).not.toBe(anchor.id);
      expect(typeof item.score).toBe('number');
      expect(item.reasons).toEqual(
        expect.arrayContaining([expect.any(String)]),
      );
    }
    // No duplicate results.
    expect(new Set(body.map((i) => i.productId)).size).toBe(body.length);

    const resultProducts = await prisma.product.findMany({
      where: {
        id: { in: body.map((i) => i.productId) },
      },
      select: { id: true, categoryId: true },
    });
    const sameCategoryCount = resultProducts.filter(
      (p) => p.categoryId === anchor.categoryId,
    ).length;
    // The hashing embedding weights category/brand tokens 3x a plain word,
    // so the same-category signal should dominate the top of the ranking —
    // not necessarily every slot, but clearly more than none.
    expect(sameCategoryCount).toBeGreaterThan(0);
  });

  it('returns 200 with an empty list for a product with no embedding, rather than erroring', async () => {
    // A random UUID never has a ProductEmbedding row — findSimilar should
    // degrade to an empty result, not throw.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/recommendations/similar/${randomUUID()}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  // ---- Trending -------------------------------------------------------------------

  it('returns a trending list bounded by the requested limit, with an explanatory reason each', async () => {
    const anonymousId = `anon-trending-${run}`;
    anonymousIds.push(anonymousId);
    const res = await request(app.getHttpServer())
      .get('/api/v1/recommendations/trending')
      .query({ limit: 4, anonymousId })
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(4);
    for (const item of res.body) {
      expect(item.reasons.length).toBeGreaterThan(0);
    }
  });

  // ---- Frequently bought with (structural — see file doc comment) ---------------

  it('returns a structurally valid frequently-bought-with list, real or cold-start-fallback', async () => {
    const anchor = await prisma.product.findFirst({
      where: { status: ProductStatus.ACTIVE, deletedAt: null, sellerId: null },
      include: { category: true },
    });
    expect(anchor).toBeTruthy();

    const anonymousId = `anon-fbt-${run}`;
    anonymousIds.push(anonymousId);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/recommendations/frequently-bought-with/${anchor!.id}`)
      .query({ limit: 3, anonymousId })
      .expect(200);

    const body = res.body as ScoredProductBody[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(3);
    const allowedReasons = new Set([
      'Frequently bought together',
      'Often paired with this product',
    ]);
    for (const item of body) {
      expect(item.productId).not.toBe(anchor!.id);
      expect(allowedReasons.has(item.reasons[0])).toBe(true);
    }
    expect(new Set(body.map((i) => i.productId)).size).toBe(body.length);
  });

  // ---- Full personalized pipeline, driven by real tracked behavior --------------

  let targetCategoryId: string;
  let trackedProductIds: string[] = [];
  let firstRecommendedProductId: string;

  it('skews personalized recommendations toward a category the caller strongly engaged with', async () => {
    const category = await prisma.category.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
        products: { some: { status: ProductStatus.ACTIVE, deletedAt: null } },
      },
      include: {
        products: {
          where: { status: ProductStatus.ACTIVE, deletedAt: null },
          take: 3,
        },
      },
      orderBy: { products: { _count: 'desc' } },
    });
    expect(category).toBeTruthy();
    expect(category!.products.length).toBeGreaterThan(0);
    targetCategoryId = category!.id;
    trackedProductIds = category!.products.map((p) => p.id);

    const anonymousId = `anon-rec-${run}`;
    anonymousIds.push(anonymousId);
    const sessionId = `sess-rec-${run}`;
    sessionIds.push(sessionId);

    // PRODUCT_ADDED_TO_CART is the strongest weighted signal (see
    // recommendation-config.ts) — track it for every product in the target
    // category before ever calling GET /recommendations for this identity,
    // so the very first cache write already reflects personalization (the
    // recommendation cache has a 10-minute TTL; querying cold first would
    // otherwise poison it for the rest of this test).
    for (const productId of trackedProductIds) {
      await trackEvent(
        customerToken,
        'PRODUCT_ADDED_TO_CART',
        productId,
        anonymousId,
        sessionId,
      );
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/recommendations')
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ limit: 10 })
      .expect(200);

    const body = res.body as ScoredProductBody[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    firstRecommendedProductId = body[0].productId;

    const recommendedProducts = await prisma.product.findMany({
      where: {
        id: { in: body.map((i) => i.productId) },
      },
      select: { id: true, categoryId: true, status: true, deletedAt: true },
    });
    expect(
      recommendedProducts.every(
        (p) => p.status === ProductStatus.ACTIVE && !p.deletedAt,
      ),
    ).toBe(true);
    const top5 = body.slice(0, 5).map((i) => i.productId);
    const top5Categories = recommendedProducts
      .filter((p) => top5.includes(p.id))
      .map((p) => p.categoryId);
    expect(top5Categories).toContain(targetCategoryId);

    // Every item still carries a human-readable explanation.
    for (const item of body) {
      expect(item.reasons.length).toBeGreaterThan(0);
    }
  });

  it('logs a real recommendation impression for every item returned to the caller', async () => {
    const impressions = await prisma.recommendationImpression.findMany({
      where: { userId: customerId, context: 'HOMEPAGE' },
    });
    expect(impressions.length).toBeGreaterThan(0);
    expect(impressions.every((i) => i.reason.length > 0)).toBe(true);
  });

  it('serves the second identical request from cache with the same ranking', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/recommendations')
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ limit: 10 })
      .expect(200);
    expect(res.body[0].productId).toBe(firstRecommendedProductId);
  });

  it('still returns a valid, non-erroring list for a fully anonymous caller with no history', async () => {
    const anonymousId = `anon-cold-${run}`;
    anonymousIds.push(anonymousId);
    const res = await request(app.getHttpServer())
      .get('/api/v1/recommendations')
      .query({ limit: 5, anonymousId })
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(5);
  });

  // ---- Evaluation (admin/analyst) ------------------------------------------------

  it('rejects the evaluation endpoint for a caller without an analytics role', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/recommendations/admin/evaluate')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('reports a real, honestly-computed evaluation report for an analyst', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/recommendations/admin/evaluate')
      .set('Authorization', `Bearer ${analystToken}`)
      .query({ k: 5 })
      .expect(200);

    expect(res.body.catalog.purchasableProducts).toBeGreaterThan(0);
    expect(res.body.coverage.totalImpressions).toBeGreaterThan(0);
    expect(res.body.coverage.productCoverage).toBeGreaterThanOrEqual(0);
    expect(res.body.coverage.productCoverage).toBeLessThanOrEqual(1);
    expect(res.body.offlineBacktest.k).toBe(5);
    // Honest reporting: with no real multi-order purchase history for our
    // fresh test users, hitRateAtK must be null (no eligible users), not a
    // fabricated number.
    if (res.body.offlineBacktest.eligibleUsers === 0) {
      expect(res.body.offlineBacktest.hitRateAtK).toBeNull();
    }
  });

  it('reflects a real click-through event in the engagement metrics', async () => {
    const anonymousId = `anon-rec-${run}`; // reuse this run's session, already tracked above
    const sessionId = `sess-rec-${run}`;
    await trackEvent(
      customerToken,
      'RECOMMENDATION_CLICKED',
      firstRecommendedProductId,
      anonymousId,
      sessionId,
    );

    const res = await request(app.getHttpServer())
      .get('/api/v1/recommendations/admin/evaluate')
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(200);

    expect(res.body.engagement.distinctImpressionPairs).toBeGreaterThan(0);
    expect(res.body.engagement.clickThroughRate).toBeGreaterThan(0);
  });

  // ---- Validation -------------------------------------------------------------

  it('rejects an out-of-range limit with a real validation error', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/recommendations/trending')
      .query({ limit: 999 })
      .expect(400);
  });
});
