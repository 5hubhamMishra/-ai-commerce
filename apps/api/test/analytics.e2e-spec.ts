import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Exercises Phase 10 (AI Analytics) end to end against the real database:
 * demand forecasting and stockout prediction driven by a genuine paid order
 * (not a mock), the two independent stockout triggers (sales velocity vs. a
 * bare reorder-point breach), the business-insights composition, the
 * dashboard's combined payload, and RBAC across the two distinct role sets
 * (ANALYST/ADMIN/SUPER_ADMIN for most routes, plus INVENTORY_MANAGER for
 * inventory-risk specifically).
 *
 * Segmentation/lifecycle classification logic itself is already covered by
 * SegmentationService's and customer-segment.util's unit tests (which mock
 * every input directly) — this suite only checks the live endpoint's real
 * shape and RBAC, not a specific customer's bucket, since attributing a
 * fresh CustomerProfile to this suite would require submitting a real
 * behavioral event and waiting on the async BullMQ aggregation worker for no
 * additional coverage of Phase 10's own logic.
 */
describe('AI Analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now();

  const adminEmail = `e2e-analytics-admin-${run}@example.com`;
  const customerEmail = `e2e-analytics-customer-${run}@example.com`;
  const inventoryManagerEmail = `e2e-analytics-invmgr-${run}@example.com`;

  let adminToken: string;
  let customerToken: string;
  let inventoryManagerToken: string;

  let categoryId: string;
  let brandId: string;
  let warehouseId: string;
  let addressId: string;

  // Ordered down to exactly zero remaining stock — critical regardless of
  // which lookback window a caller (or BusinessInsightsService's own fixed
  // 90-day default) uses, since daysUntilStockout = 0 / anyPositiveRate = 0.
  let soldOutProductId: string;
  let soldOutVariantId: string;

  // Never ordered at all — no sales velocity to project a date from, but
  // real stock below its real admin-configured reorder point.
  let reorderBreachProductId: string;
  let reorderBreachVariantId: string;

  const orderIds: string[] = [];

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

    const passwordHash = await bcrypt.hash('password123', 4);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: 'E2E Analytics Admin',
        roles: {
          create: [
            { role: Role.CONTENT_MANAGER },
            { role: Role.INVENTORY_MANAGER },
            { role: Role.ADMIN },
          ],
        },
      },
    });
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'password123' })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    await prisma.user.create({
      data: {
        email: inventoryManagerEmail,
        passwordHash,
        name: 'E2E Analytics Inventory Manager',
        roles: { create: [{ role: Role.INVENTORY_MANAGER }] },
      },
    });
    const invMgrLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: inventoryManagerEmail, password: 'password123' })
      .expect(200);
    inventoryManagerToken = invMgrLogin.body.accessToken;

    const customerRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: customerEmail,
        password: 'password123',
        name: 'E2E Analytics Customer',
      })
      .expect(201);
    customerToken = customerRegister.body.accessToken;

    // ---- Catalog fixtures --------------------------------------------------
    const categoryRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Analytics Category ${run}` })
      .expect(201);
    categoryId = categoryRes.body.id;

    const brandRes = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Analytics Brand ${run}` })
      .expect(201);
    brandId = brandRes.body.id;

    const warehouseRes = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E Analytics Warehouse ${run}`,
        code: `WH-AN-${run}`,
        line1: '1 Forecast Way',
        city: 'Testville',
        state: 'TS',
        postalCode: '00000',
        country: 'IN',
      })
      .expect(201);
    warehouseId = warehouseRes.body.id;

    const soldOutProductRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E Analytics Sold Out Product ${run}`,
        description: 'Sold down to zero stock for the analytics e2e suite.',
        categoryId,
        brandId,
        status: 'ACTIVE',
      })
      .expect(201);
    soldOutProductId = soldOutProductRes.body.id;

    const soldOutVariantRes = await request(app.getHttpServer())
      .post(`/api/v1/products/${soldOutProductId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: `E2E-ANALYTICS-SOLDOUT-${run}`, price: 500 })
      .expect(201);
    soldOutVariantId = soldOutVariantRes.body.variants[0].id;

    // Exactly enough stock for the order below, so committed inventory
    // leaves zero available — a real, not simulated, stockout.
    await request(app.getHttpServer())
      .put(
        `/api/v1/inventory/variants/${soldOutVariantId}/warehouses/${warehouseId}`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantityOnHand: 2 })
      .expect(200);

    const reorderBreachProductRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E Analytics Reorder Breach Product ${run}`,
        description: 'Below its reorder point, never actually purchased.',
        categoryId,
        brandId,
        status: 'ACTIVE',
      })
      .expect(201);
    reorderBreachProductId = reorderBreachProductRes.body.id;

    const reorderBreachVariantRes = await request(app.getHttpServer())
      .post(`/api/v1/products/${reorderBreachProductId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: `E2E-ANALYTICS-REORDER-${run}`, price: 800 })
      .expect(201);
    reorderBreachVariantId = reorderBreachVariantRes.body.variants[0].id;

    await request(app.getHttpServer())
      .put(
        `/api/v1/inventory/variants/${reorderBreachVariantId}/warehouses/${warehouseId}`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantityOnHand: 2, reorderPoint: 10 })
      .expect(200);

    const addressRes = await request(app.getHttpServer())
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        line1: '7 Analytics Lane',
        city: 'Testville',
        state: 'TS',
        postalCode: '00002',
        country: 'IN',
      })
      .expect(201);
    addressId = addressRes.body.id;

    // ---- A real, paid order — the actual sales history demand forecasting reads ----
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId: soldOutVariantId, quantity: 2 })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `analytics-order-${run}`)
      .send({ addressId, shippingMethod: 'STANDARD' })
      .expect(201);
    const orderId = orderRes.body.id as string;
    orderIds.push(orderId);

    const paymentRes = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `analytics-pay-${run}`)
      .send({ orderId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentRes.body.paymentId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `analytics-pay-confirm-${run}`)
      .send({})
      .expect(201);
  });

  afterAll(async () => {
    for (const id of orderIds) {
      await prisma.order.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of [soldOutProductId, reorderBreachProductId]) {
      if (id)
        await prisma.product.delete({ where: { id } }).catch(() => undefined);
    }
    if (categoryId)
      await prisma.category
        .delete({ where: { id: categoryId } })
        .catch(() => undefined);
    if (brandId)
      await prisma.brand
        .delete({ where: { id: brandId } })
        .catch(() => undefined);
    if (warehouseId)
      await prisma.warehouse
        .delete({ where: { id: warehouseId } })
        .catch(() => undefined);
    await prisma.user.deleteMany({
      where: {
        email: { in: [adminEmail, customerEmail, inventoryManagerEmail] },
      },
    });
    await app.close();
  });

  // ---- Demand forecasting ----------------------------------------------------

  it('forecasts real, increasing demand for a variant with a genuine recent paid order', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/analytics/admin/demand-forecast/${soldOutVariantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ lookbackDays: 14 })
      .expect(200);

    expect(res.body).toMatchObject({
      variantId: soldOutVariantId,
      unitsSoldEarlierHalf: 0,
      unitsSoldRecentHalf: 2,
      trend: 'increasing',
      dataSufficient: true,
    });
    // halfWindowDays = 14 / 2 = 7; rate = 2 units / 7 days.
    expect(res.body.dailyRateRecentHalf).toBeCloseTo(2 / 7, 5);
    expect(res.body.projectedDailyRate).toBeCloseTo(2 / 7, 5);
  });

  it('404s for a variant that does not exist', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/v1/analytics/admin/demand-forecast/00000000-0000-0000-0000-000000000000',
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('includes the fixture variant in the catalog-wide forecast, ranked by real recent velocity', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/admin/demand-forecast')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ lookbackDays: 14, limit: 500 })
      .expect(200);

    const entry = (res.body as { variantId: string; trend: string }[]).find(
      (f) => f.variantId === soldOutVariantId,
    );
    expect(entry).toBeDefined();
    expect(entry?.trend).toBe('increasing');
  });

  // ---- Inventory / stockout prediction ---------------------------------------

  it('flags the sold-out variant as a critical stockout risk with a real days-until-stockout figure', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/admin/inventory-risk')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ limit: 500 })
      .expect(200);

    const risk = (
      res.body as {
        variantId: string;
        riskLevel: string;
        availableUnits: number;
        daysUntilStockout: number | null;
        dataSufficient: boolean;
      }[]
    ).find((r) => r.variantId === soldOutVariantId);

    expect(risk).toMatchObject({
      riskLevel: 'critical',
      availableUnits: 0,
      daysUntilStockout: 0,
      dataSufficient: true,
    });
  });

  it('flags the reorder-point breach as a warning with no fabricated days-until-stockout', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/admin/inventory-risk')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ limit: 500 })
      .expect(200);

    const risk = (
      res.body as {
        variantId: string;
        riskLevel: string;
        belowReorderPoint: boolean;
        daysUntilStockout: number | null;
        dataSufficient: boolean;
      }[]
    ).find((r) => r.variantId === reorderBreachVariantId);

    expect(risk).toMatchObject({
      riskLevel: 'warning',
      belowReorderPoint: true,
      daysUntilStockout: null,
      dataSufficient: false,
    });
  });

  it('lets an INVENTORY_MANAGER (no ANALYST/ADMIN role) read inventory risk, but not segmentation', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/admin/inventory-risk')
      .set('Authorization', `Bearer ${inventoryManagerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/analytics/admin/segmentation')
      .set('Authorization', `Bearer ${inventoryManagerToken}`)
      .expect(403);
  });

  // ---- Segmentation (structural — see file-level doc comment) ----------------

  it('returns an honestly-shaped segmentation report whose buckets sum to the real total', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/admin/segmentation')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as {
      totalProfiles: number;
      bySegment: { count: number }[];
      byLifecycleStage: { count: number }[];
    };
    const segmentSum = body.bySegment.reduce((sum, s) => sum + s.count, 0);
    const stageSum = body.byLifecycleStage.reduce((sum, s) => sum + s.count, 0);
    expect(segmentSum).toBe(body.totalProfiles);
    expect(stageSum).toBe(body.totalProfiles);
  });

  // ---- Business insights + dashboard -----------------------------------------

  it('generates a real, critical stockout insight backed by the fixture data, never a fabricated one', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/admin/insights')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const insights = res.body as {
      id: string;
      severity: string;
      metrics: Record<string, number | null>;
    }[];
    const critical = insights.find(
      (i) => i.id === 'inventory.critical_stockout',
    );
    expect(critical?.severity).toBe('critical');
    expect(critical?.metrics.criticalCount).toBeGreaterThanOrEqual(1);
  });

  it('returns a combined dashboard payload composing every real report', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('segmentation.totalProfiles');
    expect(res.body).toHaveProperty(
      'recommendations.catalog.purchasableProducts',
    );
    expect(res.body).toHaveProperty('search.totalSearches');
    expect(res.body).toHaveProperty('shopai.totalInteractions');
    expect(Array.isArray(res.body.topStockoutRisks)).toBe(true);
    expect(Array.isArray(res.body.insights)).toBe(true);
  });

  // ---- RBAC --------------------------------------------------------------------

  it('rejects a plain customer from every analytics admin route', async () => {
    for (const path of [
      '/api/v1/analytics/admin/segmentation',
      '/api/v1/analytics/admin/demand-forecast',
      '/api/v1/analytics/admin/inventory-risk',
      '/api/v1/analytics/admin/insights',
      '/api/v1/analytics/admin/dashboard',
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    }
  });

  it('rejects an unauthenticated caller', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/admin/dashboard')
      .expect(401);
  });
});
