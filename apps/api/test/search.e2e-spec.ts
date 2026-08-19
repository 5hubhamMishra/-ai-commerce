import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type SearchItem = {
  id: string;
  name: string;
  brand: { slug: string } | null;
};
type SearchResponse = {
  items: SearchItem[];
  total: number;
  page: number;
  pageSize: number;
  understood: {
    category: string | null;
    brand: string | null;
    minPrice: number | null;
    maxPrice: number | null;
    attributes: string[];
  } | null;
};

/**
 * Exercises Phase 8 (AI Semantic Search) end to end against the real
 * database: query understanding (category/brand/price/attribute
 * extraction), hybrid keyword+semantic ranking, explicit filters overriding
 * NL-extracted ones, search analytics logging + the admin report, and RBAC.
 *
 * Fixture products live in the *real* seeded "Headphones" category (query
 * understanding only recognizes real category names — see
 * RuleBasedQueryUnderstandingAdapter) but under a fresh, run-scoped brand,
 * so every assertion can filter to `brand: <this run's brand>` and stay
 * exact regardless of the other ~10 real headphones already in that
 * category or other suites running concurrently against this shared
 * dev database.
 */
describe('AI Semantic Search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now();

  const adminEmail = `e2e-search-admin-${run}@example.com`;
  const customerEmail = `e2e-search-customer-${run}@example.com`;

  let adminToken: string;
  let customerToken: string;
  let categoryId: string;
  let brandId: string;
  let brandSlug: string;

  const userIds: string[] = [];
  const productIds: string[] = [];

  async function createProduct(params: {
    name: string;
    description: string;
    price: number;
  }) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: params.name,
        description: params.description,
        categoryId,
        brandId,
        status: 'ACTIVE',
      })
      .expect(201);
    const productId = res.body.id as string;
    productIds.push(productId);

    await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `E2E-SEARCH-${run}-${productIds.length}`,
        price: params.price,
      })
      .expect(201);

    return productId;
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
        name: 'E2E Search Admin',
        roles: {
          create: [{ role: Role.CONTENT_MANAGER }, { role: Role.ADMIN }],
        },
      },
    });
    userIds.push(admin.id);
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'password123' })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    const customerRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: customerEmail,
        password: 'password123',
        name: 'E2E Search Customer',
      })
      .expect(201);
    customerToken = customerRegister.body.accessToken;
    userIds.push(customerRegister.body.user.id);

    const headphonesCategory = await prisma.category.findFirst({
      where: { name: 'Headphones', deletedAt: null },
    });
    if (!headphonesCategory) {
      throw new Error(
        'Seed data missing: expected a real "Headphones" category for Phase 8 search tests',
      );
    }
    categoryId = headphonesCategory.id;

    const brandRes = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Search Brand ${run}` })
      .expect(201);
    brandId = brandRes.body.id;
    brandSlug = brandRes.body.slug;

    // Matches every recognized signal (name/description keywords, the
    // "gym" use-case's implied attributes) and is within a 5000 budget.
    await createProduct({
      name: `Aurora Wireless Gym Buds ${run}`,
      description:
        'Wireless sweat-resistant earbuds built for gym workouts and daily training.',
      price: 3000,
    });
    // Same category/brand, shares only the literal word "headphones" with a
    // "wireless gym" query, no gym/wireless keywords or attributes — should
    // rank below the product above for that query, but still surface.
    await createProduct({
      name: `Aurora Wired Studio Headphones ${run}`,
      description:
        'Wired studio headphones for professional audio mixing at the office.',
      price: 4500,
    });
    // Matches on keywords/attributes just as strongly as the first product,
    // but priced above a 5000 budget — must be excluded by the price filter,
    // not merely ranked lower.
    await createProduct({
      name: `Aurora Wireless Gym Buds Elite ${run}`,
      description:
        'Wireless sweat-resistant earbuds for gym workouts, premium edition.',
      price: 9000,
    });

    // Synchronous — the same admin endpoint Phase 7 uses, guarantees every
    // fixture product above has a real pgvector embedding before any test
    // runs, rather than racing the live catalog-write event hook.
    await request(app.getHttpServer())
      .post('/api/v1/recommendations/admin/reindex-embeddings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  afterAll(async () => {
    // search_query_logs.user_id is ON DELETE SET NULL (unlike
    // RecommendationImpression's RESTRICT), so no explicit cleanup ordering
    // is required before deleting users — see DECISIONS.md ADR-024. The log
    // rows this suite created are left in place deliberately, same as Phase
    // 7 deliberately kept product_embeddings: real, legitimate analytics
    // history, not test pollution.
    await prisma.product
      .deleteMany({ where: { id: { in: productIds } } })
      .catch(() => undefined);
    await prisma.brand
      .delete({ where: { id: brandId } })
      .catch(() => undefined);
    await prisma.user
      .deleteMany({ where: { id: { in: userIds } } })
      .catch(() => undefined);
    await app.close();
  });

  // ---- Query understanding + hybrid ranking ----------------------------------

  it("parses the spec's own worked example and applies it as a real filter+ranking signal", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'wireless gym headphones under 5000', brand: brandSlug })
      .expect(200);
    const body = res.body as SearchResponse;

    expect(body.understood).toMatchObject({
      category: 'headphones',
      maxPrice: 5000,
    });
    expect(body.understood?.attributes).toEqual(
      expect.arrayContaining(['wireless', 'gym', 'sweat-resistant']),
    );

    // The 9000-priced product must be excluded by the price filter, not just
    // ranked last.
    expect(body.items.some((i) => i.name.includes('Elite'))).toBe(false);
    expect(body.total).toBe(2);

    // The strong keyword+attribute match ranks above the weak one.
    const names = body.items.map((i) => i.name);
    expect(names[0]).toContain('Aurora Wireless Gym Buds');
    expect(names[0]).not.toContain('Studio');
  });

  it('lets an explicit price filter override a looser (or absent) natural-language one', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'wireless gym', brand: brandSlug, maxPrice: 4000 })
      .expect(200);
    const body = res.body as SearchResponse;

    // Only the 3000-priced product clears an explicit 4000 ceiling; the
    // 4500-priced one would have passed the (absent) NL price constraint.
    expect(body.total).toBe(1);
    expect(body.items[0].name).toContain('Aurora Wireless Gym Buds');
    expect(body.items[0].name).not.toContain('Elite');
  });

  it('still finds a keyword match with no query-understanding signal at all', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'Aurora', brand: brandSlug })
      .expect(200);
    const body = res.body as SearchResponse;
    expect(body.total).toBe(3);
  });

  it('returns an honest zero result set when a filter genuinely excludes everything, without erroring', async () => {
    // maxPrice: 1 is below every real product's price — deterministically
    // zero regardless of which candidates the keyword/semantic paths pull
    // in (unlike a "nonsense query" probe, which can't rule out an
    // unrelated catalog product coincidentally scoring a nonzero hashed
    // similarity against 100+ shared products this suite doesn't control).
    const res = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'headphones', maxPrice: 1 })
      .expect(200);
    const body = res.body as SearchResponse;
    expect(body.total).toBe(0);
    expect(body.items).toEqual([]);
  });

  it('paginates hybrid results', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'Aurora', brand: brandSlug, pageSize: 2, page: 2 })
      .expect(200);
    const body = res.body as SearchResponse;
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(2);
    expect(body.total).toBe(3);
    expect(body.items.length).toBe(1);
  });

  it('leaves the pure filter/sort path (no q) unaffected by query understanding', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ brand: brandSlug, sort: 'price_asc' })
      .expect(200);
    const body = res.body as SearchResponse;
    expect(body.understood).toBeNull();
    expect(body.items.map((i) => i.name)).toEqual([
      expect.stringContaining('Aurora Wireless Gym Buds'),
      expect.stringContaining('Aurora Wired Studio'),
      expect.stringContaining('Elite'),
    ]);
  });

  // ---- Search analytics --------------------------------------------------------

  it('logs a zero-result query and surfaces it in the admin analytics report', async () => {
    const distinctiveQuery = `e2e-search-analytics-probe-${run}`;
    // Same deterministic-zero technique as above (impossible price ceiling)
    // so this doesn't depend on the query being un-matchable by chance.
    await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: distinctiveQuery, maxPrice: 1 })
      .expect(200);

    const report = await request(app.getHttpServer())
      .get('/api/v1/search/admin/analytics')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(report.body.totalSearches).toBeGreaterThan(0);
    expect(
      (report.body.topZeroResultQueries as { query: string }[]).some(
        (r) => r.query === distinctiveQuery.toLowerCase(),
      ),
    ).toBe(true);
  });

  it('rejects the analytics report from a non-admin caller', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/search/admin/analytics')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('rejects the analytics report from an unauthenticated caller', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/search/admin/analytics')
      .expect(401);
  });
});
