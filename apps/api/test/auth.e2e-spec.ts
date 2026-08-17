import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Exercises the real register -> login -> refresh (rotation) -> logout -> reuse-rejected
 * flow end to end, per the spec's critical-journey testing requirement. Requires a reachable
 * DATABASE_URL (see docs/DEVELOPMENT.md); a throwaway user is created and cleaned up per run.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e-${Date.now()}@example.com`;

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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('registers a new customer with a hashed password and default CUSTOMER role', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', name: 'E2E User' })
      .expect(201);

    expect(res.body.user.email).toBe(email);
    expect(res.body.user.roles).toEqual(['CUSTOMER']);
    expect(res.body.accessToken).toEqual(expect.any(String));

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored?.passwordHash).not.toBe('password123');
  });

  it('rejects a second registration with the same email', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', name: 'E2E User' })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
        expect(res.body.error.requestId).toEqual(expect.any(String));
      });
  });

  it('rejects login with the wrong password', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('logs in and can access a protected route with the access token', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(me.body.email).toBe(email);
  });

  it('rejects protected routes without a token', () => {
    return request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
  });

  it('rotates the refresh token and rejects reuse of the old one', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    const oldRefreshToken = login.body.refreshToken;

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(200);

    expect(refreshed.body.refreshToken).not.toBe(oldRefreshToken);

    // Reusing the now-revoked token must fail, and must also revoke the new one (theft response).
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });
});
