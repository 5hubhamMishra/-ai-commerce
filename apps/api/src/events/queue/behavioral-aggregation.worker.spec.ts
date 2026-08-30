import { ConfigService } from '@nestjs/config';
import { BehavioralAggregationWorker } from './behavioral-aggregation.worker';

describe('BehavioralAggregationWorker', () => {
  const previousVercel = process.env.VERCEL;

  afterEach(() => {
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  });

  it('does not start a continuous worker inside Vercel', () => {
    process.env.VERCEL = '1';
    const config = {
      get: jest.fn().mockReturnValue('redis://localhost:6379'),
    } as unknown as ConfigService;
    const service = new BehavioralAggregationWorker(config, {} as never);

    service.onModuleInit();

    expect((service as unknown as { worker?: unknown }).worker).toBeUndefined();
  });
});
