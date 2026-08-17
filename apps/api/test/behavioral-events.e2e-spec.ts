import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Exercises Phase 6 (Behavioral Data Foundation) end to end against a real
 * database and a real BullMQ/Redis queue: anonymous + user session
 * upserting/identity-linking, the event collector (schema validation,
 * duplicate prevention via a client-supplied eventId), the async
 * aggregation pipeline actually deriving a CustomerProfile from real
 * catalog/order data, personalization opt-out gating aggregation without
 * blocking raw collection, and the privacy-deletion endpoint.
 */
describe('Behavioral events (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now();
  const customerEmail = `e2e-evt-customer-${run}@example.com`;

  let customerToken: string;
  let customerId: string;

  const behavioralEventIds: string[] = [];
  const sessionIds: string[] = [];

  const nextId = () => randomUUID();
  const now = () => new Date().toISOString();

  /** The aggregation queue is genuinely async — poll instead of a fixed
   *  sleep, bounded so a real regression still fails fast rather than
   *  hanging. */
  async function waitFor<T>(
    check: () => Promise<T | undefined | null>,
    timeoutMs = 5000,
    intervalMs = 150,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const result = await check();
      if (result) return result;
      if (Date.now() > deadline) {
        throw new Error(`waitFor timed out after ${timeoutMs}ms`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
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

    const customerRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: customerEmail,
        password: 'password123',
        name: 'E2E Events Customer',
      })
      .expect(201);
    customerToken = customerRegister.body.accessToken;
    customerId = customerRegister.body.user.id;
  });

  afterAll(async () => {
    await prisma.behavioralEvent
      .deleteMany({ where: { id: { in: behavioralEventIds } } })
      .catch(() => undefined);
    // Every anonymousId used anywhere in this file ends with this run's
    // shared timestamp (`anon-${run}`, `anon-dup-${run}`, etc.) — matching
    // by that suffix catches every anonymous-keyed CustomerProfile the
    // anonymous-tracking tests below create, without having to hand-track
    // each one (a hand-tracked list already proved easy to under-count in
    // the Phase 5 marketplace suite's own teardown fix).
    await prisma.customerProfile
      .deleteMany({
        where: {
          OR: [
            { userId: customerId },
            { anonymousId: { endsWith: String(run) } },
          ],
        },
      })
      .catch(() => undefined);
    await prisma.session
      .deleteMany({ where: { id: { in: sessionIds } } })
      .catch(() => undefined);
    await prisma.user
      .delete({ where: { id: customerId } })
      .catch(() => undefined);
    await app.close();
  });

  // ---- Collector: validation, anonymous tracking, sessions ----------------------

  it('rejects a malformed event with a real validation error, not a crash', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/events')
      .send({
        events: [
          {
            eventType: 'NOT_A_REAL_TYPE',
            anonymousId: 'a',
            sessionId: 'b',
            source: 'WEB',
            occurredAt: now(),
          },
        ],
      })
      .expect(400)
      .expect((res) => {
        const fields = (res.body.error.details.fields as string[]).join(' ');
        expect(fields).toContain('eventId must be a UUID');
        expect(fields).toContain('eventType must be one of');
      });
  });

  it('accepts a batch of events from a fully anonymous caller (no Authorization header)', async () => {
    const anonymousId = `anon-${run}`;
    const sessionId = `sess-anon-${run}`;
    sessionIds.push(sessionId);
    const eventId = nextId();
    behavioralEventIds.push(eventId);

    await request(app.getHttpServer())
      .post('/api/v1/events')
      .send({
        events: [
          {
            eventId,
            eventType: 'PRODUCT_SEARCHED',
            anonymousId,
            sessionId,
            source: 'WEB',
            occurredAt: now(),
          },
        ],
      })
      .expect(202)
      .expect((res) => {
        expect(res.body.accepted).toBe(1);
      });

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });
    expect(session).toBeTruthy();
    expect(session!.userId).toBeNull();
    expect(session!.anonymousId).toBe(anonymousId);
  });

  it('a retry with the same eventId is a safe no-op, not a duplicate row (duplicate prevention)', async () => {
    const anonymousId = `anon-dup-${run}`;
    const sessionId = `sess-dup-${run}`;
    sessionIds.push(sessionId);
    const eventId = nextId();
    behavioralEventIds.push(eventId);
    const body = {
      events: [
        {
          eventId,
          eventType: 'PRODUCT_CLICKED',
          anonymousId,
          sessionId,
          source: 'WEB',
          occurredAt: now(),
        },
      ],
    };

    await request(app.getHttpServer())
      .post('/api/v1/events')
      .send(body)
      .expect(202);
    await request(app.getHttpServer())
      .post('/api/v1/events')
      .send(body)
      .expect(202);

    const rows = await prisma.behavioralEvent.findMany({
      where: { id: eventId },
    });
    expect(rows).toHaveLength(1);
  });

  it("a logged-in caller's events are attributed to their real userId, and the session gets linked to their identity", async () => {
    const anonymousId = `anon-linked-${run}`;
    const sessionId = `sess-linked-${run}`;
    sessionIds.push(sessionId);
    const eventId = nextId();
    behavioralEventIds.push(eventId);

    await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        events: [
          {
            eventId,
            eventType: 'USER_LOGIN',
            anonymousId,
            sessionId,
            source: 'WEB',
            occurredAt: now(),
          },
        ],
      })
      .expect(202);

    const event = await prisma.behavioralEvent.findUnique({
      where: { id: eventId },
    });
    expect(event!.userId).toBe(customerId);
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });
    expect(session!.userId).toBe(customerId);
  });

  // ---- Aggregation: a real derived profile from real catalog/order data ---------

  let productId: string;
  let productPrice: number;

  it('aggregates a real PRODUCT_VIEWED event into the customer profile via the async queue', async () => {
    const product = await prisma.product.findFirst({
      where: { status: 'ACTIVE', deletedAt: null, sellerId: null },
      include: {
        variants: { where: { isActive: true, deletedAt: null }, take: 1 },
      },
    });
    expect(product).toBeTruthy();
    productId = product!.id;
    productPrice = Number(product!.variants[0].price);

    const anonymousId = `anon-view-${run}`;
    const sessionId = `sess-view-${run}`;
    sessionIds.push(sessionId);
    const eventId = nextId();
    behavioralEventIds.push(eventId);

    await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        events: [
          {
            eventId,
            eventType: 'PRODUCT_VIEWED',
            anonymousId,
            sessionId,
            source: 'WEB',
            entityId: productId,
            occurredAt: now(),
          },
        ],
      })
      .expect(202);

    // Wait for THIS event specifically (not just "a profile row exists" —
    // an earlier event in this suite already created one with an empty
    // delta, so that check alone would resolve before this event's own job
    // has actually run and race the assertions below against a half-applied
    // profile).
    const event = await waitFor(() =>
      prisma.behavioralEvent
        .findUnique({ where: { id: eventId } })
        .then((e) => (e?.processedAt ? e : null)),
    );

    const profile = await prisma.customerProfile.findUnique({
      where: { userId: customerId },
    });
    expect(profile!.eventCount).toBeGreaterThanOrEqual(1);
    expect(Number(profile!.priceObservedMin)).toBe(productPrice);
    expect(Number(profile!.priceObservedMax)).toBe(productPrice);

    const viewCounts = profile!.categoryViewCounts as Record<string, number>;
    expect(viewCounts[product!.categoryId]).toBeGreaterThanOrEqual(1);
    expect(event.processedAt).not.toBeNull();
  });

  it("the caller's own read endpoints reflect the aggregated profile and raw activity", async () => {
    const profileRes = await request(app.getHttpServer())
      .get('/api/v1/users/me/behavioral-profile')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(profileRes.body.profile.segment).toEqual(expect.any(String));
    expect(profileRes.body.profile.lifecycleStage).toEqual(expect.any(String));

    const activityRes = await request(app.getHttpServer())
      .get('/api/v1/users/me/activity')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(activityRes.body.total).toBeGreaterThanOrEqual(1);
    expect(
      (activityRes.body.items as { eventType: string }[]).some(
        (i) => i.eventType === 'PRODUCT_VIEWED',
      ),
    ).toBe(true);
  });

  // ---- Privacy: opt-out gates aggregation, deletion erases both -----------------

  it('disabling personalization stops new events from being aggregated, without blocking collection', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/profile')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ personalizationEnabled: false })
      .expect(200);

    const before = await prisma.customerProfile.findUnique({
      where: { userId: customerId },
    });

    const anonymousId = `anon-optout-${run}`;
    const sessionId = `sess-optout-${run}`;
    sessionIds.push(sessionId);
    const eventId = nextId();
    behavioralEventIds.push(eventId);

    await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        events: [
          {
            eventId,
            eventType: 'PRODUCT_VIEWED',
            anonymousId,
            sessionId,
            source: 'WEB',
            entityId: productId,
            occurredAt: now(),
          },
        ],
      })
      .expect(202);

    // The raw event is still collected (activity history keeps working)...
    const event = await waitFor(() =>
      prisma.behavioralEvent.findUnique({ where: { id: eventId } }),
    );
    expect(event).toBeTruthy();

    // ...but it's never queued for aggregation, so the profile's eventCount
    // never moves — give the (non-existent) job a moment it would have used
    // if it existed, then assert nothing changed.
    await new Promise((r) => setTimeout(r, 400));
    const after = await prisma.customerProfile.findUnique({
      where: { userId: customerId },
    });
    expect(after!.eventCount).toBe(before!.eventCount);
    expect(event.processedAt).toBeNull();

    // Re-enable for the next test.
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/profile')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ personalizationEnabled: true })
      .expect(200);
  });

  it('privacy deletion erases both the raw event history and the derived profile', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/users/me/activity')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);

    const activityRes = await request(app.getHttpServer())
      .get('/api/v1/users/me/activity')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(activityRes.body.total).toBe(0);

    const profileRes = await request(app.getHttpServer())
      .get('/api/v1/users/me/behavioral-profile')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(profileRes.body.profile).toBeNull();
  });
});
