import { HttpException, HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports liveness without touching dependencies', () => {
    const controller = new HealthController({} as never);

    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('reports readiness when the database responds', async () => {
    const controller = new HealthController({
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as never);

    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      database: 'connected',
    });
  });

  it('returns 503 when the database is unreachable', async () => {
    const controller = new HealthController({
      $queryRaw: jest.fn().mockRejectedValue(new Error('database offline')),
    } as never);

    await expect(controller.ready()).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: {
        code: 'NOT_READY',
      },
    } satisfies Partial<HttpException>);
  });
});
