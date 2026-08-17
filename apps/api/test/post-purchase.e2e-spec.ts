import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Exercises Phase 4 (Post-Purchase) end to end against a real database: order
 * tracking/dispatch, the full return review pipeline (approve/reject/pickup/
 * inspect/complete) driving refund, replacement, and exchange outcomes,
 * inventory restocking (including the damaged-goods bucket), notifications,
 * support tickets, help-center content, and invoices.
 */
describe('Post-purchase (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now();
  const adminEmail = `e2e-pp-admin-${run}@example.com`;
  const customerEmail = `e2e-pp-customer-${run}@example.com`;

  let adminToken: string;
  let customerToken: string;

  let categoryId: string;
  let brandId: string;
  let warehouseId: string;
  let addressId: string;

  let variantRefundId: string;
  let variantReplacementId: string;
  let variantExchangeFromId: string;
  let variantExchangeToId: string;
  let variantExchangeCheaperId: string;

  const orderIds: string[] = [];
  const productIds: string[] = [];
  let seq = 0;
  const nextKey = (label: string) => `pp-${label}-${run}-${++seq}`;

  async function createVariant(price: number, stock: number) {
    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E PP Product ${run}-${++seq}`,
        description: 'Post-purchase e2e fixture product.',
        categoryId,
        brandId,
        status: 'ACTIVE',
      })
      .expect(201);
    productIds.push(productRes.body.id);

    const variantRes = await request(app.getHttpServer())
      .post(`/api/v1/products/${productRes.body.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: `E2E-PP-SKU-${run}-${seq}`, price })
      .expect(201);
    const variantId = variantRes.body.variants[0].id;

    await request(app.getHttpServer())
      .put(`/api/v1/inventory/variants/${variantId}/warehouses/${warehouseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantityOnHand: stock })
      .expect(200);

    return variantId;
  }

  /** Places an order for the given variant and walks it all the way through
   *  payment + fulfillment to DELIVERED, returning the order id and its single
   *  order-item id. */
  async function placeAndDeliverOrder(variantId: string, quantity: number) {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', nextKey('order'))
      .send({ addressId, shippingMethod: 'STANDARD' })
      .expect(201);
    const orderId = orderRes.body.id as string;
    const orderItemId = orderRes.body.items[0].id as string;
    orderIds.push(orderId);

    const payRes = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', nextKey('pay-create'))
      .send({ orderId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/payments/${payRes.body.paymentId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', nextKey('pay-confirm'))
      .send({})
      .expect(201);

    for (const status of ['PROCESSING', 'PACKED']) {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/admin/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
    }
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/admin/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'SHIPPED',
        carrier: 'BlueDart',
        trackingNumber: `TRK-${orderId.slice(0, 8)}`,
      })
      .expect(200);
    for (const status of ['OUT_FOR_DELIVERY', 'DELIVERED']) {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/admin/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
    }

    return { orderId, orderItemId };
  }

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
        name: 'E2E PP Admin',
        roles: {
          create: [
            { role: Role.CONTENT_MANAGER },
            { role: Role.INVENTORY_MANAGER },
            { role: Role.SUPPORT_AGENT },
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
      .send({
        email: customerEmail,
        password: 'password123',
        name: 'E2E PP Customer',
      })
      .expect(201);
    customerToken = customerRegister.body.accessToken;

    const categoryRes = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E PP Category ${run}` })
      .expect(201);
    categoryId = categoryRes.body.id;

    const brandRes = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E PP Brand ${run}` })
      .expect(201);
    brandId = brandRes.body.id;

    const warehouseRes = await request(app.getHttpServer())
      .post('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `E2E PP Warehouse ${run}`,
        code: `PPWH-${run}`,
        line1: '1 Fulfillment Way',
        city: 'Testville',
        state: 'TS',
        postalCode: '00000',
        country: 'IN',
      })
      .expect(201);
    warehouseId = warehouseRes.body.id;

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

    variantRefundId = await createVariant(1000, 20);
    variantReplacementId = await createVariant(1000, 20);
    variantExchangeFromId = await createVariant(1000, 20);
    variantExchangeToId = await createVariant(1500, 20); // pricier — positive price difference
    variantExchangeCheaperId = await createVariant(700, 20); // cheaper — negative price difference
  });

  afterAll(async () => {
    // support_tickets/messages, invoices, exchanges, replacements, refunds and
    // return_requests all FK to orders/users with no cascade (post-purchase
    // history shouldn't silently vanish out from under a live order/user in
    // production, same reasoning as the Phase 3 address/order FK) — this
    // suite creates real rows in every one of those tables, so they all have
    // to be cleared, in dependency order, before orders/users can be deleted.
    // Read the order id set from the DB rather than trusting `orderIds` to
    // have captured every creation path.
    const testUsers = await prisma.user.findMany({
      where: { email: { in: [adminEmail, customerEmail] } },
      select: { id: true },
    });
    const testUserIds = testUsers.map((u) => u.id);
    const testOrders = await prisma.order.findMany({
      where: { userId: { in: testUserIds } },
      select: { id: true },
    });
    const testOrderIds = [
      ...new Set([...orderIds, ...testOrders.map((o) => o.id)]),
    ];

    await prisma.supportMessage
      .deleteMany({ where: { senderId: { in: testUserIds } } })
      .catch(() => undefined);
    await prisma.supportTicket
      .deleteMany({ where: { userId: { in: testUserIds } } })
      .catch(() => undefined);
    await prisma.exchange
      .deleteMany({ where: { orderId: { in: testOrderIds } } })
      .catch(() => undefined);
    await prisma.replacement
      .deleteMany({ where: { orderId: { in: testOrderIds } } })
      .catch(() => undefined);
    await prisma.refund
      .deleteMany({ where: { orderId: { in: testOrderIds } } })
      .catch(() => undefined);
    await prisma.returnRequest
      .deleteMany({ where: { orderId: { in: testOrderIds } } })
      .catch(() => undefined);
    await prisma.invoice
      .deleteMany({ where: { orderId: { in: testOrderIds } } })
      .catch(() => undefined);

    for (const id of testOrderIds) {
      await prisma.order.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of productIds) {
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
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    await app.close();
  });

  // ---- Order tracking ---------------------------------------------------------

  it('dispatching an order requires carrier and tracking number, then exposes a tracking timeline', async () => {
    const { orderId } = await placeAndDeliverOrder(variantRefundId, 1);

    const tracking = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}/tracking`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(tracking.body.orderStatus).toBe('DELIVERED');
    const shipment = tracking.body.shipment as {
      carrier: string;
      status: string;
      events: { status: string }[];
    };
    expect(shipment.carrier).toBe('BlueDart');
    expect(shipment.status).toBe('DELIVERED');
    expect(shipment.events.map((e) => e.status)).toEqual([
      'PICKED_UP',
      'DELIVERED',
    ]);

    await request(app.getHttpServer())
      .post(`/api/v1/orders/admin/${orderId}/tracking-events`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'IN_TRANSIT',
        location: 'Mumbai hub',
        description: 'In transit',
      })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}/tracking`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const updatedShipment = updated.body.shipment as {
      events: { status: string }[];
    };
    expect(updatedShipment.events).toHaveLength(3);

    // this order is reused by the refund-flow tests below
    refundOrderId = orderId;
  });

  it('rejects SHIPPED without carrier/trackingNumber', async () => {
    const { orderId } = await placeAndDeliverOrderUpToConfirmed(
      variantReplacementId,
      1,
    );
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/admin/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PROCESSING' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/admin/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PACKED' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/admin/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SHIPPED' })
      .expect(400)
      .expect((res) => {
        expect(res.body.error.code).toBe('DISPATCH_INFO_REQUIRED');
      });
    // Finish delivering it for real so it can be used by the replacement-flow test below.
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/admin/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'SHIPPED',
        carrier: 'Delhivery',
        trackingNumber: `TRK-${orderId.slice(0, 8)}`,
      })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/admin/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/admin/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DELIVERED' })
      .expect(200);
    replacementOrderId = orderId;
  });

  // Helper duplicated inline above needs the "up to CONFIRMED" variant used just once —
  // defined here so it's available to the test above.
  async function placeAndDeliverOrderUpToConfirmed(
    variantId: string,
    quantity: number,
  ) {
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId, quantity })
      .expect(201);
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', nextKey('order'))
      .send({ addressId, shippingMethod: 'STANDARD' })
      .expect(201);
    const orderId = orderRes.body.id as string;
    orderIds.push(orderId);
    const payRes = await request(app.getHttpServer())
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', nextKey('pay-create'))
      .send({ orderId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${payRes.body.paymentId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', nextKey('pay-confirm'))
      .send({})
      .expect(201);
    return { orderId };
  }

  let refundOrderId: string;
  let replacementOrderId: string;

  // ---- Return -> Refund, with inventory restocking -----------------------------

  let refundReturnId: string;

  it('rejects a return request for an order that is not DELIVERED', async () => {
    const { orderId } = await placeAndDeliverOrderUpToConfirmed(
      variantExchangeFromId,
      1,
    );
    const order = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(order.body.status).toBe('CONFIRMED');

    await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId,
        reason: 'NO_LONGER_NEEDED',
        resolution: 'REFUND',
        items: [
          { orderItemId: '00000000-0000-0000-0000-000000000000', quantity: 1 },
        ],
      })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('ORDER_NOT_RETURNABLE');
      });

    // Deliver it for real — reused by the exchange-flow tests below.
    for (const status of ['PROCESSING', 'PACKED']) {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/admin/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
    }
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/admin/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'SHIPPED',
        carrier: 'Ekart',
        trackingNumber: `TRK-${orderId.slice(0, 8)}`,
      })
      .expect(200);
    for (const status of ['OUT_FOR_DELIVERY', 'DELIVERED']) {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/admin/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
    }
    exchangeOrderId = orderId;
  });

  let exchangeOrderId: string;

  it('creates a return request for a DELIVERED order and transitions the order to RETURN_REQUESTED', async () => {
    const orderDetail = await request(app.getHttpServer())
      .get(`/api/v1/orders/${refundOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const orderItemId = (orderDetail.body.items as { id: string }[])[0].id;

    const res = await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: refundOrderId,
        reason: 'DEFECTIVE',
        reasonNote: 'Arrived damaged',
        resolution: 'REFUND',
        items: [{ orderItemId, quantity: 1 }],
      })
      .expect(201);
    expect(res.body.status).toBe('REQUESTED');
    refundReturnId = res.body.id;

    const order = await request(app.getHttpServer())
      .get(`/api/v1/orders/${refundOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(order.body.status).toBe('RETURN_REQUESTED');
  });

  it('rejects a second concurrent return request for the same order', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/orders/${refundOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const orderItemId = refundReturnId; // any placeholder id, request fails before it's read

    await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: refundOrderId,
        reason: 'OTHER',
        resolution: 'REFUND',
        items: [{ orderItemId, quantity: 1 }],
      })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('RETURN_ALREADY_IN_PROGRESS');
      });
  });

  it('walks the return through approve -> pickup -> inspect -> complete, refunding and restocking', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/returns/admin/${refundReturnId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/returns/admin/${refundReturnId}/schedule-pickup`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/returns/admin/${refundReturnId}/mark-picked-up`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/returns/admin/${refundReturnId}/start-inspection`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const before = await request(app.getHttpServer())
      .get(`/api/v1/inventory/variants/${variantRefundId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const onHandBefore = before.body[0].quantityOnHand as number;

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/returns/admin/${refundReturnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const returnItemId = (detail.body.items as { id: string }[])[0].id;

    const completed = await request(app.getHttpServer())
      .post(`/api/v1/returns/admin/${refundReturnId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            returnRequestItemId: returnItemId,
            condition: 'unopened',
            isDamaged: false,
          },
        ],
      })
      .expect(201);
    expect(completed.body.status).toBe('COMPLETED');
    expect(completed.body.refund.status).toBe('COMPLETED');
    expect(completed.body.refund.amount).toBe(1000);

    const order = await request(app.getHttpServer())
      .get(`/api/v1/orders/${refundOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(order.body.status).toBe('REFUNDED');

    const after = await request(app.getHttpServer())
      .get(`/api/v1/inventory/variants/${variantRefundId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body[0].quantityOnHand).toBe(onHandBefore + 1);
  });

  it('exposes the refund via the standalone refunds endpoint', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/refunds/order/${refundOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('COMPLETED');
  });

  // ---- Return -> cancel and reject paths ----------------------------------------

  it('lets the customer cancel their own return before admin approval, reverting the order', async () => {
    const { orderId, orderItemId } = await placeAndDeliverOrder(
      variantReplacementId,
      1,
    );

    const returnRes = await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId,
        reason: 'NO_LONGER_NEEDED',
        resolution: 'REFUND',
        items: [{ orderItemId, quantity: 1 }],
      })
      .expect(201);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/returns/${returnRes.body.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');

    const order = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(order.body.status).toBe('DELIVERED');
  });

  it('lets admin reject a return, reverting the order back to DELIVERED', async () => {
    const orderDetail = await request(app.getHttpServer())
      .get(`/api/v1/orders/${replacementOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const orderItemId = (orderDetail.body.items as { id: string }[])[0].id;

    const returnRes = await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: replacementOrderId,
        reason: 'OTHER',
        resolution: 'REPLACEMENT',
        items: [{ orderItemId, quantity: 1 }],
      })
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/returns/admin/${returnRes.body.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Item is outside the return policy.' })
      .expect(201);
    expect(rejected.body.status).toBe('REJECTED');

    const order = await request(app.getHttpServer())
      .get(`/api/v1/orders/${replacementOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(order.body.status).toBe('DELIVERED');
  });

  // ---- Return -> Replacement, with a damaged item routed to the damaged bucket --

  it('completes a replacement-resolution return, routing a damaged item to the damaged inventory bucket', async () => {
    const orderDetail = await request(app.getHttpServer())
      .get(`/api/v1/orders/${replacementOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const orderItemId = (orderDetail.body.items as { id: string }[])[0].id;

    const returnRes = await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: replacementOrderId,
        reason: 'DEFECTIVE',
        resolution: 'REPLACEMENT',
        items: [{ orderItemId, quantity: 1 }],
      })
      .expect(201);
    const returnId = returnRes.body.id as string;

    for (const step of [
      'approve',
      'schedule-pickup',
      'mark-picked-up',
      'start-inspection',
    ]) {
      await request(app.getHttpServer())
        .post(`/api/v1/returns/admin/${returnId}/${step}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
    }

    const before = await request(app.getHttpServer())
      .get(`/api/v1/inventory/variants/${variantReplacementId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const damagedBefore = before.body[0].quantityDamaged as number;
    const onHandBefore = before.body[0].quantityOnHand as number;

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/returns/admin/${returnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const returnItemId = (detail.body.items as { id: string }[])[0].id;

    const completed = await request(app.getHttpServer())
      .post(`/api/v1/returns/admin/${returnId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            returnRequestItemId: returnItemId,
            condition: 'damaged in transit',
            isDamaged: true,
          },
        ],
      })
      .expect(201);
    expect(completed.body.replacement.status).toBe('APPROVED');

    const order = await request(app.getHttpServer())
      .get(`/api/v1/orders/${replacementOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(order.body.status).toBe('REPLACEMENT');

    const after = await request(app.getHttpServer())
      .get(`/api/v1/inventory/variants/${variantReplacementId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body[0].quantityDamaged).toBe(damagedBefore + 1);
    expect(after.body[0].quantityOnHand).toBe(onHandBefore); // damaged stock never returns to sellable

    const dispatched = await request(app.getHttpServer())
      .patch(
        `/api/v1/replacements/admin/${completed.body.replacement.id}/dispatch`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        carrier: 'Ekart',
        trackingNumber: `REPL-${returnId.slice(0, 8)}`,
      })
      .expect(200);
    expect(dispatched.body.status).toBe('SHIPPED');

    const delivered = await request(app.getHttpServer())
      .patch(
        `/api/v1/replacements/admin/${completed.body.replacement.id}/delivered`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(delivered.body.status).toBe('DELIVERED');
  });

  // ---- Return -> Exchange, with a positive price difference ---------------------

  it('completes an exchange-resolution return with a positive price difference, requiring payment confirmation before dispatch', async () => {
    const orderDetail = await request(app.getHttpServer())
      .get(`/api/v1/orders/${exchangeOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const orderItemId = (orderDetail.body.items as { id: string }[])[0].id;

    const returnRes = await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: exchangeOrderId,
        reason: 'WRONG_ITEM',
        resolution: 'EXCHANGE',
        desiredVariantId: variantExchangeToId,
        items: [{ orderItemId, quantity: 1 }],
      })
      .expect(201);
    const returnId = returnRes.body.id as string;

    for (const step of [
      'approve',
      'schedule-pickup',
      'mark-picked-up',
      'start-inspection',
    ]) {
      await request(app.getHttpServer())
        .post(`/api/v1/returns/admin/${returnId}/${step}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
    }

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/returns/admin/${returnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const returnItemId = (detail.body.items as { id: string }[])[0].id;

    const completed = await request(app.getHttpServer())
      .post(`/api/v1/returns/admin/${returnId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            returnRequestItemId: returnItemId,
            condition: 'unopened',
            isDamaged: false,
          },
        ],
      })
      .expect(201);
    expect(completed.body.exchange.status).toBe('AWAITING_PAYMENT');
    expect(completed.body.exchange.priceDifference).toBe(500); // 1500 - 1000

    const order = await request(app.getHttpServer())
      .get(`/api/v1/orders/${exchangeOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(order.body.status).toBe('EXCHANGED');

    // Can't dispatch before the price difference is settled.
    await request(app.getHttpServer())
      .patch(`/api/v1/exchanges/admin/${completed.body.exchange.id}/dispatch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        carrier: 'BlueDart',
        trackingNumber: `EXC-${returnId.slice(0, 8)}`,
      })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('INVALID_EXCHANGE_TRANSITION');
      });

    const confirmed = await request(app.getHttpServer())
      .patch(
        `/api/v1/exchanges/admin/${completed.body.exchange.id}/confirm-payment`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(confirmed.body.status).toBe('APPROVED');

    const dispatched = await request(app.getHttpServer())
      .patch(`/api/v1/exchanges/admin/${completed.body.exchange.id}/dispatch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        carrier: 'BlueDart',
        trackingNumber: `EXC-${returnId.slice(0, 8)}`,
      })
      .expect(200);
    expect(dispatched.body.status).toBe('SHIPPED');
  });

  it('completes an exchange-resolution return with a negative price difference by refunding it automatically', async () => {
    const { orderId, orderItemId } = await placeAndDeliverOrder(
      variantExchangeToId,
      1,
    ); // ordered the pricier one
    const returnRes = await request(app.getHttpServer())
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId,
        reason: 'BETTER_PRICE_FOUND',
        resolution: 'EXCHANGE',
        desiredVariantId: variantExchangeCheaperId,
        items: [{ orderItemId, quantity: 1 }],
      })
      .expect(201);
    const returnId = returnRes.body.id as string;

    for (const step of [
      'approve',
      'schedule-pickup',
      'mark-picked-up',
      'start-inspection',
    ]) {
      await request(app.getHttpServer())
        .post(`/api/v1/returns/admin/${returnId}/${step}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
    }
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/returns/admin/${returnId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const returnItemId = (detail.body.items as { id: string }[])[0].id;

    const completed = await request(app.getHttpServer())
      .post(`/api/v1/returns/admin/${returnId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            returnRequestItemId: returnItemId,
            condition: 'unopened',
            isDamaged: false,
          },
        ],
      })
      .expect(201);
    expect(completed.body.exchange.status).toBe('APPROVED'); // no payment needed
    expect(completed.body.exchange.priceDifference).toBe(-800); // 700 - 1500

    const refunds = await request(app.getHttpServer())
      .get(`/api/v1/refunds/order/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (refunds.body as { amount: number; status: string }[]).some(
        (r) => r.amount === 800 && r.status === 'COMPLETED',
      ),
    ).toBe(true);
  });

  // ---- Standalone (goodwill) refund ----------------------------------------------

  it('issues a standalone admin refund not tied to a return, capped at the remaining refundable amount', async () => {
    const { orderId } = await placeAndDeliverOrder(variantRefundId, 1);

    await request(app.getHttpServer())
      .post('/api/v1/refunds/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, amount: 5000, reason: 'Too much' })
      .expect(400)
      .expect((res) => {
        expect(res.body.error.code).toBe('REFUND_EXCEEDS_REMAINING_AMOUNT');
      });

    const res = await request(app.getHttpServer())
      .post('/api/v1/refunds/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId, amount: 100, reason: 'Goodwill credit' })
      .expect(201);
    expect(res.body.status).toBe('COMPLETED');
  });

  // ---- Notifications --------------------------------------------------------------

  it('accumulates in-app notifications for order/return events and supports marking them read', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThan(0);

    const unreadId = list.body[0].id as string;
    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${unreadId}/read`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const afterMarkAll = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ unreadOnly: true })
      .expect(200);
    expect(afterMarkAll.body).toEqual([]);
  });

  // ---- Support tickets --------------------------------------------------------------

  it('creates a support ticket, lets staff reply (auto-starting IN_PROGRESS), and resolves it', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        subject: 'Where is my order?',
        category: 'ORDER',
        orderId: refundOrderId,
        message: 'It has been a while, any update?',
      })
      .expect(201);
    expect(created.body.status).toBe('OPEN');
    const ticketId = created.body.id;

    const replied = await request(app.getHttpServer())
      .post(`/api/v1/support/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'Looking into this now.' })
      .expect(201);
    expect(replied.body.status).toBe('IN_PROGRESS');
    expect(replied.body.messages).toHaveLength(2);

    const resolved = await request(app.getHttpServer())
      .patch(`/api/v1/support/tickets/admin/${ticketId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'RESOLVED' })
      .expect(200);
    expect(resolved.body.status).toBe('RESOLVED');
  });

  it('hides a support ticket from a customer who does not own it', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ subject: 'General question', category: 'OTHER', message: 'Hi' })
      .expect(201);

    const otherRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `e2e-pp-other-${run}@example.com`,
        password: 'password123',
        name: 'Other',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/support/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${otherRegister.body.accessToken}`)
      .expect(404);

    await prisma.user.deleteMany({
      where: { email: `e2e-pp-other-${run}@example.com` },
    });
  });

  // ---- Help center ------------------------------------------------------------------

  it('admin publishes a help article and the public can read it by slug', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/help-center/articles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `How returns work ${run}`,
        body: 'You can request a return within the return window.',
        category: 'Returns',
      })
      .expect(201);
    expect(created.body.slug).toContain('how-returns-work');

    const publicRead = await request(app.getHttpServer())
      .get(`/api/v1/help-center/articles/${created.body.slug}`)
      .expect(200);
    expect(publicRead.body.title).toContain('How returns work');

    const list = await request(app.getHttpServer())
      .get('/api/v1/help-center/articles')
      .query({ category: 'Returns' })
      .expect(200);
    expect(
      (list.body as { id: string }[]).some((a) => a.id === created.body.id),
    ).toBe(true);

    await prisma.helpArticle.delete({ where: { id: created.body.id } });
  });

  // ---- Invoices ------------------------------------------------------------------

  it('rejects an invoice for an order that has not been paid yet', async () => {
    const addRes = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ variantId: variantRefundId, quantity: 1 })
      .expect(201);
    expect(addRes.body.items).toHaveLength(1);
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .set('Idempotency-Key', nextKey('order-unpaid'))
      .send({ addressId, shippingMethod: 'STANDARD' })
      .expect(201);
    orderIds.push(orderRes.body.id);

    await request(app.getHttpServer())
      .get(`/api/v1/invoices/order/${orderRes.body.id}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('ORDER_NOT_INVOICEABLE');
      });

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${orderRes.body.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({})
      .expect(201);
  });

  it('generates a stable, sequentially-numbered invoice once an order is paid', async () => {
    const invoice = await request(app.getHttpServer())
      .get(`/api/v1/invoices/order/${refundOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(invoice.body.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(invoice.body.billTo.name).toBe('E2E PP Customer');

    // Idempotent — same order, same invoice number on a second call.
    const again = await request(app.getHttpServer())
      .get(`/api/v1/invoices/order/${refundOrderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(again.body.invoiceNumber).toBe(invoice.body.invoiceNumber);
  });

  it("rejects fetching another customer's invoice", async () => {
    const otherRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `e2e-pp-invoice-other-${run}@example.com`,
        password: 'password123',
        name: 'Other',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/invoices/order/${refundOrderId}`)
      .set('Authorization', `Bearer ${otherRegister.body.accessToken}`)
      .expect(404);

    await prisma.user.deleteMany({
      where: { email: `e2e-pp-invoice-other-${run}@example.com` },
    });
  });
});
