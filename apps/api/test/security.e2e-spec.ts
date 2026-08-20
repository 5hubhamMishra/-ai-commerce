import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Automated regression suite for PROMPT 14's "security tests" requirement — distinct from
 * Phase 12's manual/code-review audit (docs/SECURITY_REVIEW.md, docs/THREAT_MODEL.md). Those
 * findings were fixed once and verified by hand; this suite exists so the same classes of bug
 * (forged tokens, mass assignment, missing RBAC guards, injection payloads, missing rate
 * limits) get caught automatically if they ever regress. Boots the app the same way
 * src/main.ts does (helmet + cookieParser + ValidationPipe + global prefix), which none of
 * the other e2e specs do, so this is also the only place production header behavior is
 * actually exercised end to end.
 */
describe('Security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now();
  const customerEmail = `e2e-sec-customer-${run}@example.com`;
  const otherEmail = `e2e-sec-other-${run}@example.com`;
  const adminEmail = `e2e-sec-admin-${run}@example.com`;

  let customerToken: string;
  let otherToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(helmet());
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

    const customerRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: customerEmail,
        password: 'password123',
        name: 'E2E Security Customer',
      })
      .expect(201);
    customerToken = customerRegister.body.accessToken;

    const otherRegister = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: otherEmail,
        password: 'password123',
        name: 'E2E Security Other',
      })
      .expect(201);
    otherToken = otherRegister.body.accessToken;

    const passwordHash = await bcrypt.hash('password123', 4);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: 'E2E Security Admin',
        roles: { create: [{ role: Role.ADMIN }] },
      },
    });
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: 'password123' })
      .expect(200);
    adminToken = adminLogin.body.accessToken;
  });

  afterAll(async () => {
    const userIds = (
      await prisma.user.findMany({
        where: { email: { in: [customerEmail, otherEmail, adminEmail] } },
        select: { id: true },
      })
    ).map((u) => u.id);
    // support_tickets.user_id is ON DELETE RESTRICT by design (post-purchase/support history
    // shouldn't silently vanish — same convention as the Phase 4 address/order FK fix); delete
    // the tickets this suite created first (cascades their messages) before the users.
    await prisma.supportTicket.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [customerEmail, otherEmail, adminEmail] } },
    });
    await app.close();
  });

  describe('security response headers (main.ts helmet config)', () => {
    it('sets standard hardening headers on a plain request', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('JWT integrity', () => {
    it('rejects a token with a tampered signature', async () => {
      const parts = customerToken.split('.');
      const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -4)}abcd`;
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tampered}`)
        .expect(401);
    });

    it('rejects a token with a tampered payload (privilege escalation attempt)', async () => {
      const parts = customerToken.split('.');
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      payload.roles = ['SUPER_ADMIN'];
      const forgedPayload = Buffer.from(JSON.stringify(payload)).toString(
        'base64url',
      );
      const forged = `${parts[0]}.${forgedPayload}.${parts[2]}`;
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });

    it('rejects a structurally invalid bearer token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
    });

    it('rejects an empty Authorization header', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', '')
        .expect(401);
    });
  });

  describe('mass assignment protection', () => {
    it('rejects an attempt to self-assign a role at registration', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: `e2e-sec-massassign-${run}@example.com`,
          password: 'password123',
          name: 'Attempted Admin',
          roles: ['ADMIN'],
        })
        .expect(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects an attempt to set an unrecognized/privileged field on profile update', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/me/profile')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ id: 'attacker-controlled-id', phone: '9999999999' })
        .expect(400);
    });
  });

  describe('injection payload handling', () => {
    it('treats a SQL-injection-shaped search query as literal text, not an error', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/search')
        .query({ q: "' OR '1'='1" })
        .expect(200);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it("a stacked-query-shaped payload doesn't crash or leak driver internals", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ search: "x'; DROP TABLE products; --" })
        .expect(200);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('stores and returns a script-tag payload in a free-text field as inert data, not corrupted or executed', async () => {
      const payload = '<script>alert(document.cookie)</script>';
      const created = await request(app.getHttpServer())
        .post('/api/v1/support/tickets')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ subject: 'XSS probe', category: 'OTHER', message: payload })
        .expect(201);
      expect(created.body.messages[0].body).toBe(payload);

      const fetched = await request(app.getHttpServer())
        .get(`/api/v1/support/tickets/${created.body.id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(fetched.body.messages[0].body).toBe(payload);
    });

    it('an invalid-UUID-shaped path param is treated as "not found", not a raw driver error (no native uuid column type)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders/not-a-uuid')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(404);
      expect(JSON.stringify(res.body).toLowerCase()).not.toContain('prisma');
    });
  });

  describe('RBAC guard coverage sweep', () => {
    // A cross-module sample of admin-only mutation routes. Each domain's own e2e suite
    // already tests its RBAC in depth; this sweep exists to catch a systemically missing
    // @Roles()/@UseGuards() on a route nobody thought to check from a fresh module.
    const adminMutations: Array<[string, string]> = [
      ['POST', '/api/v1/categories'],
      ['POST', '/api/v1/brands'],
      ['POST', '/api/v1/warehouses'],
      ['PATCH', '/api/v1/sellers/admin/does-not-matter/verify'],
      ['POST', '/api/v1/products'],
    ];

    it.each(adminMutations)(
      '%s %s rejects an unauthenticated caller with 401',
      async (method, path) => {
        await request(app.getHttpServer())
          [method.toLowerCase() as 'post' | 'patch'](path)
          .send({})
          .expect(401);
      },
    );

    it.each(adminMutations)(
      '%s %s rejects a plain CUSTOMER with 403, never 200/201',
      async (method, path) => {
        const res = await request(app.getHttpServer())
          [method.toLowerCase() as 'post' | 'patch'](path)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({});
        expect(res.status).toBe(403);
      },
    );
  });

  describe('IDOR cross-account isolation', () => {
    it("a customer cannot read another customer's profile by guessing no ID is even accepted (route is always self-scoped)", async () => {
      const mine = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      const theirs = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect(mine.body.email).toBe(customerEmail);
      expect(theirs.body.email).toBe(otherEmail);
      expect(mine.body.id).not.toBe(theirs.body.id);
    });

    it('an admin token can reach an admin-only listing a customer token cannot', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/products/admin')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/products/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('rate limiting', () => {
    it('throttles repeated login attempts past the documented limit (10/min)', async () => {
      const attempts = Array.from({ length: 12 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            email: `nonexistent-${run}@example.com`,
            password: 'wrong-password',
          }),
      );
      const results = await Promise.all(attempts);
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 401).length).toBeGreaterThan(0);
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    }, 20000);
  });
});
