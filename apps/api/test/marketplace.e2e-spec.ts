import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type EarningView = {
  orderId: string;
  status: string;
  grossAmount: number;
  commissionAmount: number;
  netAmount: number;
};

/**
 * Exercises Phase 5 (Marketplace) end to end against a real database: seller
 * onboarding/verification, the seller-scoped catalog/inventory layer
 * (reusing Phase 2's ProductsService/InventoryService under ownership
 * checks), checkout with a mixed platform+marketplace cart (commission
 * snapshotting, order-item seller scoping), earnings/payouts, seller
 * ratings, and the suspend/reinstate moderation cascade.
 */
describe('Marketplace (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now();
  const adminEmail = `e2e-mkt-admin-${run}@example.com`;
  const sellerAEmail = `e2e-mkt-seller-a-${run}@example.com`;
  const sellerBEmail = `e2e-mkt-seller-b-${run}@example.com`;
  const customerEmail = `e2e-mkt-customer-${run}@example.com`;

  let adminToken: string;
  let sellerAToken: string;
  let sellerBToken: string;
  let customerToken: string;

  let categoryId: string;
  let addressId: string;

  let sellerAId: string;
  let sellerASlug: string;

  const orderIds: string[] = [];
  const productIds: string[] = [];
  let seq = 0;
  const nextKey = (label: string) => `mkt-${label}-${run}-${++seq}`;

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
        name: 'E2E Marketplace Admin',
        roles: {
          create: [{ role: Role.CONTENT_MANAGER }, { role: Role.ADMIN }],
        },
      },
    });
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'password123' })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    const sellerARegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: sellerAEmail,
        password: 'password123',
        name: 'Seller A Owner',
      })
      .expect(201);
    sellerAToken = sellerARegister.body.accessToken;

    const sellerBRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: sellerBEmail,
        password: 'password123',
        name: 'Seller B Owner',
      })
      .expect(201);
    sellerBToken = sellerBRegister.body.accessToken;

    const customerRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: customerEmail,
        password: 'password123',
        name: 'E2E Marketplace Customer',
      })
      .expect(201);
    customerToken = customerRegister.body.accessToken;

    const categoryRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E MKT Category ${run}` })
      .expect(201);
    categoryId = categoryRes.body.id;

    const addressRes = await request(app.getHttpServer())
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        line1: '1 Marketplace Ave',
        city: 'Testville',
        state: 'TS',
        postalCode: '00001',
        country: 'IN',
      })
      .expect(201);
    addressId = addressRes.body.id;
  });

  afterAll(async () => {
    // Prefix match, not an exact-email list: the "fresh user" test below
    // registers an extra one-off account not tracked in any named variable —
    // matching by this run's shared `e2e-mkt-*-${run}` prefix catches it too
    // instead of silently leaking it.
    const testUsers = await prisma.user.findMany({
      where: {
        email: { contains: `e2e-mkt-`, endsWith: `-${run}@example.com` },
      },
      select: { id: true },
    });
    const testUserIds = testUsers.map((u) => u.id);
    const testSellers = await prisma.seller.findMany({
      where: { ownerUserId: { in: testUserIds } },
      select: { id: true },
    });
    const testSellerIds = testSellers.map((s) => s.id);
    const testOrders = await prisma.order.findMany({
      where: { userId: { in: testUserIds } },
      select: { id: true },
    });
    const testOrderIds = [
      ...new Set([...orderIds, ...testOrders.map((o) => o.id)]),
    ];

    // Dependency order: seller-scoped child tables before orders (SellerEarning
    // RESTRICTs against order_items, which cascade-delete with their order) and
    // before sellers themselves; products/warehouses before sellers too.
    await prisma.sellerRating
      .deleteMany({ where: { sellerId: { in: testSellerIds } } })
      .catch(() => undefined);
    await prisma.sellerEarning
      .deleteMany({ where: { sellerId: { in: testSellerIds } } })
      .catch(() => undefined);
    await prisma.sellerPayout
      .deleteMany({ where: { sellerId: { in: testSellerIds } } })
      .catch(() => undefined);

    for (const id of testOrderIds) {
      await prisma.order.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of productIds) {
      await prisma.product.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.product
      .deleteMany({ where: { sellerId: { in: testSellerIds } } })
      .catch(() => undefined);
    await prisma.warehouse
      .deleteMany({ where: { sellerId: { in: testSellerIds } } })
      .catch(() => undefined);
    await prisma.seller
      .deleteMany({ where: { id: { in: testSellerIds } } })
      .catch(() => undefined);
    if (categoryId)
      await prisma.category
        .delete({ where: { id: categoryId } })
        .catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    await app.close();
  });

  // ---- Seller onboarding --------------------------------------------------------

  it('applies for a seller account and is auto-verified by the dev provider', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sellers/apply')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .send({
        businessName: `E2E MKT Seller A ${run}`,
        description: 'Test seller A',
      })
      .expect(201);
    expect(res.body.status).toBe('VERIFIED');
    sellerAId = res.body.id;
    sellerASlug = res.body.slug;
  });

  it('the SELLER role takes effect on the very next request, no re-login required', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sellers/me')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    expect(res.body.id).toBe(sellerAId);
  });

  it('rejects a second seller application from the same user', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/sellers/apply')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .send({ businessName: 'Duplicate Attempt' })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('SELLER_ACCOUNT_EXISTS');
      });
  });

  it('auto-rejects an application whose business name triggers the dev provider rejection hook', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sellers/apply')
      .set('Authorization', `Bearer ${sellerBToken}`)
      .send({ businessName: `Please reject this ${run}` })
      .expect(201);
    expect(res.body.status).toBe('REJECTED');
    expect(res.body.rejectReason).toBeTruthy();
  });

  it('a rejected (unverified) seller cannot create products', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/sellers/me/products')
      .set('Authorization', `Bearer ${sellerBToken}`)
      .send({
        name: 'Should Fail',
        description: 'x',
        categoryId,
        status: 'ACTIVE',
      })
      .expect(403)
      .expect((res) => {
        expect(res.body.error.code).toBe('SELLER_NOT_VERIFIED');
      });
  });

  it('admin can manually verify a rejected seller (no state-machine guard)', async () => {
    const sellerB = await request(app.getHttpServer())
      .get('/api/v1/sellers/me')
      .set('Authorization', `Bearer ${sellerBToken}`)
      .expect(200);
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/sellers/admin/${sellerB.body.id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.status).toBe('VERIFIED');
  });

  it('a fresh user with no seller account gets 403 on seller-only routes', async () => {
    const fresh = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `e2e-mkt-fresh-${run}@example.com`,
        password: 'password123',
        name: 'Fresh',
      })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/sellers/me')
      .set('Authorization', `Bearer ${fresh.body.accessToken}`)
      .expect(403);
  });

  it('provisions a default fulfillment warehouse on verification, editable via PATCH', async () => {
    const warehouse = await request(app.getHttpServer())
      .get('/api/v1/sellers/me/warehouse')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    expect(warehouse.body.sellerId).toBe(sellerAId);

    const updated = await request(app.getHttpServer())
      .patch('/api/v1/sellers/me/warehouse')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .send({ line1: '99 Real Fulfillment Rd', city: 'Realtown' })
      .expect(200);
    expect(updated.body.line1).toBe('99 Real Fulfillment Rd');
  });

  // ---- Seller-scoped catalog + IDOR ----------------------------------------------

  let sellerAProductId: string;
  let sellerAVariantId: string;

  it('a verified seller creates a product, variant, image, spec, and tag via the seller-scoped catalog', async () => {
    const product = await request(app.getHttpServer())
      .post('/api/v1/sellers/me/products')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .send({
        name: `E2E MKT Product ${run}`,
        description: 'A marketplace product.',
        categoryId,
        status: 'ACTIVE',
      })
      .expect(201);
    expect(product.body.seller.id).toBe(sellerAId);
    sellerAProductId = product.body.id;
    productIds.push(sellerAProductId);

    const variant = await request(app.getHttpServer())
      .post(`/api/v1/sellers/me/products/${sellerAProductId}/variants`)
      .set('Authorization', `Bearer ${sellerAToken}`)
      .send({ sku: `E2E-MKT-SKU-${run}`, price: 500 })
      .expect(201);
    sellerAVariantId = variant.body.variants[0].id;

    await request(app.getHttpServer())
      .post(`/api/v1/sellers/me/products/${sellerAProductId}/specifications`)
      .set('Authorization', `Bearer ${sellerAToken}`)
      .send({ group: 'General', key: 'Material', value: 'Aluminium' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/sellers/me/products/${sellerAProductId}/tags`)
      .set('Authorization', `Bearer ${sellerAToken}`)
      .send({ name: 'marketplace-test' })
      .expect(201);
  });

  it('sets inventory for the seller-owned variant against their own auto-provisioned warehouse', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/sellers/me/inventory/variants/${sellerAVariantId}`)
      .set('Authorization', `Bearer ${sellerAToken}`)
      .send({ quantityOnHand: 10 })
      .expect(200);

    const inv = await request(app.getHttpServer())
      .get(`/api/v1/sellers/me/inventory/variants/${sellerAVariantId}`)
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    expect(inv.body[0].quantityOnHand).toBe(10);
  });

  it("a different seller cannot see, update, or touch inventory for seller A's product (IDOR-safe 404s)", async () => {
    const sellerB = await request(app.getHttpServer())
      .get('/api/v1/sellers/me')
      .set('Authorization', `Bearer ${sellerBToken}`)
      .expect(200);
    expect(sellerB.body.id).not.toBe(sellerAId);

    await request(app.getHttpServer())
      .get(`/api/v1/sellers/me/products/${sellerAProductId}`)
      .set('Authorization', `Bearer ${sellerBToken}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/sellers/me/products/${sellerAProductId}`)
      .set('Authorization', `Bearer ${sellerBToken}`)
      .send({ name: 'Hijacked' })
      .expect(404);

    await request(app.getHttpServer())
      .put(`/api/v1/sellers/me/inventory/variants/${sellerAVariantId}`)
      .set('Authorization', `Bearer ${sellerBToken}`)
      .send({ quantityOnHand: 999 })
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('VARIANT_NOT_FOUND');
      });
  });

  it('the product appears in the public catalog and the seller storefront with seller info attached', async () => {
    const productRow = await prisma.product.findUniqueOrThrow({
      where: { id: sellerAProductId },
    });
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/products/${productRow.slug}`)
      .expect(200);
    expect(detail.body.seller).toEqual({
      id: sellerAId,
      slug: sellerASlug,
      businessName: expect.any(String),
    });

    const storefront = await request(app.getHttpServer())
      .get(`/api/v1/sellers/${sellerASlug}`)
      .expect(200);
    expect(storefront.body.status).toBe('VERIFIED');

    const storefrontProducts = await request(app.getHttpServer())
      .get(`/api/v1/sellers/${sellerASlug}/products`)
      .expect(200);
    expect(
      (storefrontProducts.body.items as { id: string }[]).some(
        (p) => p.id === sellerAProductId,
      ),
    ).toBe(true);
  });

  // ---- Checkout with a marketplace item: commission + earnings ------------------

  let marketplaceOrderId: string;

  it('checkout snapshots sellerId onto the order item and creates a PENDING seller earning', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId: sellerAVariantId, quantity: 1 })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', nextKey('order'))
      .send({ addressId, shippingMethod: 'STANDARD' })
      .expect(201);
    marketplaceOrderId = orderRes.body.id;
    orderIds.push(marketplaceOrderId);

    const payRes = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', nextKey('pay-create'))
      .send({ orderId: marketplaceOrderId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${payRes.body.paymentId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', nextKey('pay-confirm'))
      .send({})
      .expect(201);

    const earnings = await request(app.getHttpServer())
      .get('/api/v1/sellers/me/earnings')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    const earning = (earnings.body.items as EarningView[]).find(
      (e) => e.orderId === marketplaceOrderId,
    )!;
    expect(earning).toBeDefined();
    expect(earning.status).toBe('PENDING');
    expect(earning.grossAmount).toBe(500);
    expect(earning.commissionAmount).toBe(50); // 1000 bps default = 10%
    expect(earning.netAmount).toBe(450);
  });

  it("the seller's own order view shows only their line item, not the whole order", async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/sellers/me/orders')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    expect(
      (list.body.items as { orderId: string }[]).some(
        (i) => i.orderId === marketplaceOrderId,
      ),
    ).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/sellers/me/orders/${marketplaceOrderId}`)
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    expect(detail.body.items).toHaveLength(1);

    // Seller B has no items in this order at all.
    const sellerBDetail = await request(app.getHttpServer())
      .get(`/api/v1/sellers/me/orders/${marketplaceOrderId}`)
      .set('Authorization', `Bearer ${sellerBToken}`)
      .expect(200);
    expect(sellerBDetail.body.items).toHaveLength(0);
  });

  it('earning becomes AVAILABLE (derived, not stored) once the order reaches DELIVERED', async () => {
    for (const status of ['PROCESSING', 'PACKED']) {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/admin/${marketplaceOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
    }
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/admin/${marketplaceOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'SHIPPED',
        carrier: 'BlueDart',
        trackingNumber: `MKT-${run}`,
      })
      .expect(200);
    for (const status of ['OUT_FOR_DELIVERY', 'DELIVERED']) {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/admin/${marketplaceOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
    }

    const earnings = await request(app.getHttpServer())
      .get('/api/v1/sellers/me/earnings')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    const earning = (earnings.body.items as EarningView[]).find(
      (e) => e.orderId === marketplaceOrderId,
    )!;
    expect(earning.status).toBe('AVAILABLE');
  });

  // ---- Payouts --------------------------------------------------------------------

  it('admin triggers a payout covering the eligible earning, which then shows PAID', async () => {
    const payout = await request(app.getHttpServer())
      .post(`/api/v1/sellers/admin/${sellerAId}/payouts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(payout.body.status).toBe('PAID');
    expect(payout.body.amount).toBe('450'); // Decimal serializes as a string

    const earnings = await request(app.getHttpServer())
      .get('/api/v1/sellers/me/earnings')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    const earning = (earnings.body.items as EarningView[]).find(
      (e) => e.orderId === marketplaceOrderId,
    )!;
    expect(earning.status).toBe('PAID');

    const payouts = await request(app.getHttpServer())
      .get('/api/v1/sellers/me/payouts')
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    expect(payouts.body.total).toBeGreaterThanOrEqual(1);
  });

  it('rejects a duplicate payout when there are no eligible earnings left', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/sellers/admin/${sellerAId}/payouts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('NO_ELIGIBLE_EARNINGS');
      });
  });

  // ---- Ratings ----------------------------------------------------------------------

  it('a customer rates the seller after delivery; the storefront rating summary updates', async () => {
    const rating = await request(app.getHttpServer())
      .post(`/api/v1/sellers/${sellerAId}/ratings`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ orderId: marketplaceOrderId, rating: 5, comment: 'Great!' })
      .expect(201);
    expect(rating.body.rating).toBe(5);

    const storefront = await request(app.getHttpServer())
      .get(`/api/v1/sellers/${sellerASlug}`)
      .expect(200);
    expect(storefront.body.rating.average).toBe(5);
    expect(storefront.body.rating.count).toBe(1);
  });

  it('rejects a duplicate rating for the same seller and order', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/sellers/${sellerAId}/ratings`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ orderId: marketplaceOrderId, rating: 1 })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('ALREADY_RATED');
      });
  });

  // ---- Suspension cascade -----------------------------------------------------------

  it('suspending a seller sets their ACTIVE products to DRAFT and hides the storefront', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/sellers/admin/${sellerAId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'e2e suspension test' })
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('SUSPENDED');
      });

    const product = await request(app.getHttpServer())
      .get(`/api/v1/sellers/me/products/${sellerAProductId}`)
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    expect(product.body.status).toBe('DRAFT');

    await request(app.getHttpServer())
      .get(`/api/v1/sellers/${sellerASlug}`)
      .expect(404);
  });

  it('reinstating does not auto-reactivate products (seller must republish)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/sellers/admin/${sellerAId}/reinstate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('VERIFIED');
      });

    const product = await request(app.getHttpServer())
      .get(`/api/v1/sellers/me/products/${sellerAProductId}`)
      .set('Authorization', `Bearer ${sellerAToken}`)
      .expect(200);
    expect(product.body.status).toBe('DRAFT');
  });
});
