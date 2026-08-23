import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Exercises the real GET /users/me/export and DELETE /users/me flows end to end (spec PRIVACY:
 * "data export", "account deletion") — see DECISIONS.md ADR-041 for why deletion anonymizes
 * rather than hard-deletes. Requires a reachable DATABASE_URL, same as every other e2e spec.
 */
describe('Privacy (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e-privacy-${Date.now()}@example.com`;
  const password = 'password123';
  let userId: string;
  let accessToken: string;

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
      .send({ email, password, name: 'Privacy E2E User' })
      .expect(201);
    userId = register.body.user.id;
    accessToken = register.body.accessToken;

    // Real personal data across a few different sources, so the export can't pass by
    // accident on an empty account: an address, a wishlist item, and a behavioral event.
    await request(app.getHttpServer())
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        line1: '123 Real Street',
        city: 'Testville',
        state: 'TS',
        postalCode: '00000',
        country: 'US',
      })
      .expect(201);

    const product = await prisma.product.findFirst({ where: { status: 'ACTIVE' } });
    if (product) {
      await request(app.getHttpServer())
        .post('/api/v1/wishlist/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id })
        .expect(201);
    }
  });

  afterAll(async () => {
    // The account may already be anonymized+retained by the deletion test below (real
    // production behavior) — hard-delete here is just test-DB hygiene, not asserting on
    // production behavior itself.
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('export includes the real address and account data just created', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me/export')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.account.email).toBe(email);
    expect(res.body.addresses).toHaveLength(1);
    expect(res.body.addresses[0].line1).toBe('123 Real Street');
    expect(res.body).toEqual(
      expect.objectContaining({
        exportedAt: expect.any(String),
        orders: expect.any(Array),
        // null, not a missing key: no cart was ever created for this throwaway user.
        cart: null,
        wishlist: expect.any(Array),
        activity: expect.any(Array),
        notifications: expect.any(Array),
        shopaiConversations: expect.any(Array),
        supportTickets: expect.any(Array),
      }),
    );
  });

  it('rejects export and deletion without a token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/me/export')
      .expect(401);
    await request(app.getHttpServer())
      .delete('/api/v1/users/me')
      .send({ password })
      .expect(401);
  });

  it('rejects account deletion with the wrong password, leaving the account untouched', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: 'not-the-real-password' })
      .expect(401);

    const stillReal = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(stillReal.body.email).toBe(email);
  });

  it('deletes the account: anonymizes the user, scrubs addresses, revokes access', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password })
      .expect(204);

    // Real anonymization, verified directly against the database, not just the HTTP contract.
    const stored = await prisma.user.findUnique({ where: { id: userId } });
    expect(stored?.email).toBe(`deleted-${userId}@deleted.invalid`);
    expect(stored?.name).toBe('Deleted User');
    expect(stored?.isActive).toBe(false);
    expect(stored?.deletedAt).not.toBeNull();

    const addresses = await prisma.address.findMany({ where: { userId } });
    expect(addresses).toHaveLength(1);
    expect(addresses[0].line1).toBe('[deleted]');

    const wishlist = await prisma.wishlistItem.findMany({ where: { userId } });
    expect(wishlist).toHaveLength(0);

    // The access token issued before deletion is real and unexpired, but JwtStrategy
    // re-checks isActive/deletedAt against the database on every request — a still-valid
    // JWT must not be enough to keep using a deleted account.
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    // The original credentials no longer work either.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(401);
  });
});
