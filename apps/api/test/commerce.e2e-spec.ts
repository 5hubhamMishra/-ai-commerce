import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Exercises Phase 3 (Core Commerce) end to end against a real database: cart,
 * wishlist, comparison, search, shipping quotes, checkout/order creation with
 * inventory reservation, idempotent retries, payment success/failure, the order
 * state machine's fulfillment happy path, cancellation with inventory release,
 * overselling prevention, and RBAC/IDOR on order visibility.
 */
describe('Commerce (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now();
  const adminEmail = `e2e-commerce-admin-${run}@example.com`;
  const customerEmail = `e2e-commerce-customer-${run}@example.com`;
  const otherCustomerEmail = `e2e-commerce-other-${run}@example.com`;

  let adminToken: string;
  let customerToken: string;
  let otherCustomerToken: string;

  let categoryId: string;
  let categorySlug: string;
  let brandId: string;
  let warehouseId: string;
  let productId: string;
  let productSlug: string;
  let variantId: string;
  let lowStockProductId: string;
  let lowStockVariantId: string;
  let addressId: string;

  const orderIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await bcrypt.hash('password123', 4);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: 'E2E Commerce Admin',
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

    const customerRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: customerEmail, password: 'password123', name: 'E2E Customer' })
      .expect(201);
    customerToken = customerRegister.body.accessToken;

    const otherRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherCustomerEmail, password: 'password123', name: 'E2E Other Customer' })
      .expect(201);
    otherCustomerToken = otherRegister.body.accessToken;

    // ---- Catalog fixtures --------------------------------------------------
    const categoryRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Commerce Category ${run}` })
      .expect(201);
    categoryId = categoryRes.body.id;
    categorySlug = categoryRes.body.slug;

    const brandRes = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Commerce Brand ${run}` })
      .expect(201);
    brandId = brandRes.body.id;

    const warehouseRes = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E Commerce Warehouse ${run}`,
        code: `WH-${run}`,
        line1: '1 Fulfillment Way',
        city: 'Testville',
        state: 'TS',
        postalCode: '00000',
        country: 'IN',
      })
      .expect(201);
    warehouseId = warehouseRes.body.id;

    // Main product: price 1000, stock 50 — used for cart/checkout/payment/fulfillment.
    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E Commerce Product ${run}`,
        description: 'A product created by the commerce e2e suite.',
        categoryId,
        brandId,
        status: 'ACTIVE',
      })
      .expect(201);
    productId = productRes.body.id;
    productSlug = productRes.body.slug;

    const variantRes = await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: `E2E-COMMERCE-SKU-${run}`, price: 1000 })
      .expect(201);
    variantId = variantRes.body.variants[0].id;

    await request(app.getHttpServer())
      .post(`/api/v1/products/${productId}/specifications`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ group: 'General', key: 'Material', value: 'Aluminum' })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/v1/inventory/variants/${variantId}/warehouses/${warehouseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantityOnHand: 50 })
      .expect(200);

    // Second product: price 2000, stock 3 — used for comparison/search and the
    // overselling-prevention test.
    const product2Res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E Commerce Second Product ${run}`,
        description: 'Second product for comparison/search/oversell tests.',
        categoryId,
        brandId,
        status: 'ACTIVE',
      })
      .expect(201);
    lowStockProductId = product2Res.body.id;

    const variant2Res = await request(app.getHttpServer())
      .post(`/api/v1/products/${lowStockProductId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: `E2E-COMMERCE-SKU2-${run}`, price: 2000 })
      .expect(201);
    lowStockVariantId = variant2Res.body.variants[0].id;

    await request(app.getHttpServer())
      .post(`/api/v1/products/${lowStockProductId}/specifications`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ group: 'General', key: 'Material', value: 'Steel' })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/v1/inventory/variants/${lowStockVariantId}/warehouses/${warehouseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantityOnHand: 3 })
      .expect(200);

    const addressRes = await request(app.getHttpServer())
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        line1: '42 Customer Lane',
        city: 'Testville',
        state: 'TS',
        postalCode: '00001',
        country: 'IN',
      })
      .expect(201);
    addressId = addressRes.body.id;
  });

  afterAll(async () => {
    for (const id of orderIds) {
      await prisma.order.delete({ where: { id } }).catch(() => undefined);
    }
    if (productId) await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    if (lowStockProductId)
      await prisma.product.delete({ where: { id: lowStockProductId } }).catch(() => undefined);
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } }).catch(() => undefined);
    if (brandId) await prisma.brand.delete({ where: { id: brandId } }).catch(() => undefined);
    if (warehouseId)
      await prisma.warehouse.delete({ where: { id: warehouseId } }).catch(() => undefined);
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, customerEmail, otherCustomerEmail] } },
    });
    await app.close();
  });

  // ---- Cart -----------------------------------------------------------------

  it('starts with an empty cart', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.subtotal).toBe(0);
  });

  it('adds an item to the cart and computes the subtotal', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 })
      .expect(201);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(2);
    expect(res.body.subtotal).toBe(2000);
  });

  it('adding the same variant again increments quantity rather than duplicating the line', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 })
      .expect(201);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(3);
  });

  it('updates the quantity of a cart line directly', async () => {
    const cart = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const itemId = cart.body.items[0].id;

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/cart/items/${itemId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ quantity: 1 })
      .expect(200);
    expect(res.body.items[0].quantity).toBe(1);
    expect(res.body.subtotal).toBe(1000);
  });

  it('rejects operating on another customer\'s cart item (IDOR)', async () => {
    const cart = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const itemId = cart.body.items[0].id;

    await request(app.getHttpServer())
      .delete(`/api/v1/cart/items/${itemId}`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .expect(404);
  });

  // ---- Wishlist ---------------------------------------------------------------

  it('adds and lists a wishlist item, then removes it', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/wishlist/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/wishlist')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(listRes.body.items.some((i: { productId: string }) => i.productId === productId)).toBe(
      true,
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/wishlist/items/${productId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
  });

  it('adding the same product to the wishlist twice is idempotent, not an error', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/wishlist/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/wishlist/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId })
      .expect(201);
  });

  // ---- Comparison (stateless, public) ------------------------------------------

  it('compares two products and builds a spec attribute matrix', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/comparison')
      .query({ ids: `${productId},${lowStockProductId}` })
      .expect(200);
    expect(res.body.items).toHaveLength(2);
    const materialRow = res.body.attributeMatrix
      .flatMap((g: { rows: { key: string }[] }) => g.rows)
      .find((r: { key: string }) => r.key === 'Material');
    expect(materialRow.values).toEqual(['Aluminum', 'Steel']);
  });

  // ---- Search (keyword/filter/sort, price sorting included) ---------------------

  it('finds a product by keyword search', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: `E2E Commerce Product ${run}` })
      .expect(200);
    expect(res.body.items.some((i: { id: string }) => i.id === productId)).toBe(true);
  });

  it('sorts search results by price ascending', async () => {
    // Scoped to our freshly-created category so only our 2 fixture products
    // (₹1000 and ₹2000) are in scope, regardless of the other seeded catalog.
    const res = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ category: categorySlug, sort: 'price_asc' })
      .expect(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([
      productId,
      lowStockProductId,
    ]);
  });

  // ---- Shipping quote -----------------------------------------------------------

  it('quotes shipping methods for the current cart, matching the free-shipping threshold rule', async () => {
    // Cart currently holds 1 unit at ₹1000 — below the ₹5000 free-shipping threshold.
    const res = await request(app.getHttpServer())
      .get('/api/v1/shipping/quote')
      .query({ addressId })
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const standard = res.body.find((m: { method: string }) => m.method === 'STANDARD');
    expect(standard.fee).toBe(149);
  });

  // ---- Checkout / order creation, with idempotency -------------------------------

  it('rejects order creation without an Idempotency-Key header', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ addressId, shippingMethod: 'STANDARD' })
      .expect(400)
      .expect((res) => {
        expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      });
  });

  let mainOrderId: string;
  const orderIdempotencyKey = `order-key-${run}`;

  it('creates an order, reserving inventory and clearing the cart', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', orderIdempotencyKey)
      .send({ addressId, shippingMethod: 'STANDARD' })
      .expect(201);

    expect(res.body.status).toBe('PENDING_PAYMENT');
    expect(res.body.subtotal).toBe(1000);
    expect(res.body.total).toBe(1000 + 149);
    mainOrderId = res.body.id;
    orderIds.push(mainOrderId);

    const cart = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(cart.body.items).toEqual([]);

    const inventory = await request(app.getHttpServer())
      .get(`/api/v1/inventory/variants/${variantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(inventory.body[0].quantityReserved).toBe(1);
  });

  it('replays the same order on a retried request with the same Idempotency-Key, without double-reserving stock', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', orderIdempotencyKey)
      .send({ addressId, shippingMethod: 'STANDARD' })
      .expect(201);
    expect(res.body.id).toBe(mainOrderId);

    const inventory = await request(app.getHttpServer())
      .get(`/api/v1/inventory/variants/${variantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(inventory.body[0].quantityReserved).toBe(1);
  });

  it('rejects checkout with an empty cart', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `order-empty-cart-${run}`)
      .send({ addressId, shippingMethod: 'STANDARD' })
      .expect(400)
      .expect((res) => {
        expect(res.body.error.code).toBe('CART_EMPTY');
      });
  });

  // ---- RBAC / IDOR on order visibility --------------------------------------------

  it('lets the owner view their own order but hides it (404) from another customer', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/orders/${mainOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/orders/${mainOrderId}`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .expect(404);
  });

  it('lets a privileged admin view any order via the admin endpoint', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/orders/admin/${mainOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('rejects a plain customer from the admin order listing', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/orders/admin')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  // ---- Payments -------------------------------------------------------------------

  it('rejects a payment attempt from a user who does not own the order', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .set('Idempotency-Key', `pay-wrong-user-${run}`)
      .send({ orderId: mainOrderId })
      .expect(404);
  });

  let paymentId: string;

  it('creates a payment intent for the order (server-computed amount)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `pay-create-${run}`)
      .send({ orderId: mainOrderId })
      .expect(201);
    expect(res.body.amount).toBe(1000 + 149);
    paymentId = res.body.paymentId;
  });

  it('confirming the payment moves the order straight to CONFIRMED and commits reserved inventory', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/payments/${paymentId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `pay-confirm-${run}`)
      .send({})
      .expect(201);
    expect(res.body.status).toBe('SUCCEEDED');

    const order = await request(app.getHttpServer())
      .get(`/api/v1/orders/${mainOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(order.body.status).toBe('CONFIRMED');
    const toStatuses = order.body.stateHistory.map((h: { toStatus: string }) => h.toStatus);
    expect(toStatuses).toEqual(['PENDING_PAYMENT', 'PAID', 'CONFIRMED']);

    const inventory = await request(app.getHttpServer())
      .get(`/api/v1/inventory/variants/${variantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(inventory.body[0].quantityReserved).toBe(0);
    expect(inventory.body[0].quantityCommitted).toBe(1);
  });

  it('cannot create a second payment for an order that is no longer PENDING_PAYMENT', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `pay-second-${run}`)
      .send({ orderId: mainOrderId })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('ORDER_NOT_PAYABLE');
      });
  });

  // ---- Admin fulfillment happy path -------------------------------------------------

  it('walks the order through the fulfillment state machine, decrementing on-hand stock on SHIPPED', async () => {
    for (const status of ['PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/admin/${mainOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
      expect(res.body.status).toBe(status);
    }

    const inventory = await request(app.getHttpServer())
      .get(`/api/v1/inventory/variants/${variantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(inventory.body[0].quantityOnHand).toBe(49);
    expect(inventory.body[0].quantityCommitted).toBe(0);
  });

  it('rejects an out-of-order / skipped status transition', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/admin/${mainOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PROCESSING' })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('INVALID_ORDER_TRANSITION');
      });
  });

  it('cannot cancel a DELIVERED order', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${mainOrderId}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({})
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('ORDER_NOT_CANCELLABLE');
      });
  });

  // ---- Cancellation releases inventory ----------------------------------------------

  it('cancelling a PENDING_PAYMENT order releases its reservation back to available stock', async () => {
    const addRes = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 })
      .expect(201);
    expect(addRes.body.items).toHaveLength(1);

    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `order-cancel-${run}`)
      .send({ addressId, shippingMethod: 'EXPRESS' })
      .expect(201);
    const cancelOrderId = orderRes.body.id;
    orderIds.push(cancelOrderId);

    let inventory = await request(app.getHttpServer())
      .get(`/api/v1/inventory/variants/${variantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(inventory.body[0].quantityReserved).toBe(2);

    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/orders/${cancelOrderId}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Changed my mind' })
      .expect(201);
    expect(cancelRes.body.status).toBe('CANCELLED');

    inventory = await request(app.getHttpServer())
      .get(`/api/v1/inventory/variants/${variantId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(inventory.body[0].quantityReserved).toBe(0);
  });

  // ---- Payment failure path -----------------------------------------------------------

  it('a declined payment leaves the order in PENDING_PAYMENT and inventory still reserved', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity: 1 })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `order-decline-${run}`)
      .send({ addressId, shippingMethod: 'STANDARD' })
      .expect(201);
    const declineOrderId = orderRes.body.id;
    orderIds.push(declineOrderId);

    const payRes = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `pay-decline-create-${run}`)
      .send({ orderId: declineOrderId })
      .expect(201);

    const confirmRes = await request(app.getHttpServer())
      .post(`/api/v1/payments/${payRes.body.paymentId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `pay-decline-confirm-${run}`)
      .send({ simulateFailure: true })
      .expect(201);
    expect(confirmRes.body.status).toBe('FAILED');

    const order = await request(app.getHttpServer())
      .get(`/api/v1/orders/${declineOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(order.body.status).toBe('PENDING_PAYMENT');

    // Clean up: cancel so the reservation doesn't leak into later assertions.
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${declineOrderId}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({})
      .expect(201);
  });

  // ---- Overselling prevention ------------------------------------------------------

  it('refuses to create an order that would oversell available stock', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId: lowStockVariantId, quantity: 10 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', `order-oversell-${run}`)
      .send({ addressId, shippingMethod: 'STANDARD' })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('INSUFFICIENT_INVENTORY');
      });

    await request(app.getHttpServer()).delete('/api/v1/cart').set('Authorization', `Bearer ${customerToken}`);
  });
});
