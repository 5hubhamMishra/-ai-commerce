import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Requires a reachable DATABASE_URL (see docs/DEVELOPMENT.md) — these hit the real Nest
 * app wiring, not mocks, per the spec's "Integration tests" requirement.
 */
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET) reports liveness without touching the database', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/ready (GET) reports readiness once the database is reachable', () => {
    return request(app.getHttpServer()).get('/ready').expect(200);
  });
});
