import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Asserts the response envelopes documented in docs/API.md actually hold across a
 * representative sample of endpoints from every domain module, not just the happy-path
 * shapes each domain's own e2e suite already checks incidentally. Two contracts matter
 * project-wide: the paginated-list shape {items, total, page, pageSize} and the error
 * shape {error: {code, message, requestId, details}}. A drift here breaks every client
 * (web, mobile) silently, since none of them are generated from a shared schema.
 */
describe('API contract (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now();
  const email = `e2e-contract-${run}@example.com`;
  let accessToken: string;

  const paginatedListShape = (body: unknown) => {
    expect(body).toEqual(
      expect.objectContaining({
        items: expect.any(Array),
        total: expect.any(Number),
        page: expect.any(Number),
        pageSize: expect.any(Number),
      }),
    );
  };

  const errorShape = (body: unknown, expectedCode?: string) => {
    expect(body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
          requestId: expect.any(String),
          details: expect.any(Object),
        }),
      }),
    );
    if (expectedCode) {
      expect((body as { error: { code: string } }).error.code).toBe(
        expectedCode,
      );
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
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

    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', name: 'E2E Contract User' })
      .expect(201);
    accessToken = register.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  describe('paginated list envelope', () => {
    // Per docs/API.md, only genuinely large/filterable collections are paginated
    // ({items, total, page, pageSize}) — /products and /search. Small, bounded catalogs
    // (/categories, /brands) are documented as returning a plain array by design, not an
    // oversight, so they're asserted separately below rather than folded into this list.
    it.each([
      ['/api/v1/products', {}],
      ['/api/v1/search?q=a', {}],
    ])('%s returns {items, total, page, pageSize}', async (path) => {
      const res = await request(app.getHttpServer()).get(path).expect(200);
      paginatedListShape(res.body);
    });

    it('an authenticated list endpoint (/api/v1/orders) returns the same shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      paginatedListShape(res.body);
    });
  });

  describe('documented plain-array list endpoints', () => {
    it.each(['/api/v1/categories', '/api/v1/brands'])(
      '%s returns a plain array, not the paginated envelope (bounded catalog, by design)',
      async (path) => {
        const res = await request(app.getHttpServer()).get(path).expect(200);
        expect(Array.isArray(res.body)).toBe(true);
      },
    );
  });

  describe('error envelope', () => {
    it('404 on an unknown product slug', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products/does-not-exist-slug')
        .expect(404);
      errorShape(res.body, 'PRODUCT_NOT_FOUND');
    });

    it('401 on a protected route with no token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .expect(401);
      errorShape(res.body);
    });

    it('403 on an authenticated but under-privileged request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Should Fail' })
        .expect(403);
      errorShape(res.body, 'FORBIDDEN');
    });

    it('400 with field details on a validation failure', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: '123' })
        .expect(400);
      errorShape(res.body, 'BAD_REQUEST');
      expect(
        (res.body as { error: { details: { fields?: unknown[] } } }).error
          .details.fields,
      ).toEqual(expect.any(Array));
    });

    it('409 with a stable code on a genuine conflict', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'password123', name: 'Dup' })
        .expect(409);
      errorShape(res.body, 'EMAIL_ALREADY_REGISTERED');
    });

    it('every error response omits internal details (no stack, no raw driver error)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .expect(401);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/); // stack-trace-shaped line
      expect(raw.toLowerCase()).not.toContain('prisma');
    });
  });

  describe('product detail shape', () => {
    it('includes the documented seller field (null for platform-owned products)', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/v1/products')
        .expect(200);
      const slug = list.body.items[0]?.slug;
      expect(slug).toEqual(expect.any(String));

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/products/${slug}`)
        .expect(200);
      expect(detail.body).toHaveProperty('seller');
      expect(detail.body).toHaveProperty('variants');
      expect(Array.isArray(detail.body.variants)).toBe(true);
    });
  });
});
