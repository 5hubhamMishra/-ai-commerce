import { Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

describe('CacheService failure modes', () => {
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    scan: jest.Mock;
    del: jest.Mock;
    quit: jest.Mock;
    on: jest.Mock;
  };
  let service: CacheService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      scan: jest.fn(),
      del: jest.fn(),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
    };
    service = new CacheService(redis as never);
  });

  it('treats Redis read failures as cache misses', async () => {
    redis.get.mockRejectedValue(new Error('redis down'));

    await expect(service.get('products:list')).resolves.toBeNull();
  });

  it('throttles repeated operation failures', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    redis.get.mockRejectedValue(new Error('redis down'));

    await service.get('products:list');
    await service.get('products:list');

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('treats Redis write failures as no-ops', async () => {
    redis.set.mockRejectedValue(new Error('redis down'));

    await expect(
      service.set('products:list', { ids: [] }, 60),
    ).resolves.toBeUndefined();
  });

  it('treats Redis prefix invalidation failures as no-ops', async () => {
    redis.scan.mockRejectedValue(new Error('redis down'));

    await expect(service.delByPrefix('products:')).resolves.toBeUndefined();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('stays a no-op when Redis is intentionally disabled', async () => {
    const serviceWithoutRedis = new CacheService(null);

    await expect(serviceWithoutRedis.get('products:list')).resolves.toBeNull();
    await expect(
      serviceWithoutRedis.set('products:list', { ids: [] }, 60),
    ).resolves.toBeUndefined();
    await expect(
      serviceWithoutRedis.delByPrefix('products:'),
    ).resolves.toBeUndefined();
    await expect(
      serviceWithoutRedis.onModuleDestroy(),
    ).resolves.toBeUndefined();
  });

  describe('Redis error-event throttling', () => {
    function triggerRedisError(message: string) {
      const [, handler] = redis.on.mock.calls.find(
        ([event]) => event === 'error',
      )! as [string, (error: Error) => void];
      handler(new Error(message));
    }

    it('logs a Redis connection error the first time it fires', () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      triggerRedisError('connection refused');

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('connection refused'),
      );
    });

    it('suppresses a repeat error within the 30s throttle window', () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      triggerRedisError('first failure');
      (Date.now as jest.Mock).mockReturnValue(1_000_000 + 10_000); // 10s later, inside the window
      triggerRedisError('second failure');

      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('logs again once the 30s throttle window has passed', () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      triggerRedisError('first failure');
      (Date.now as jest.Mock).mockReturnValue(1_000_000 + 30_001); // just past the window
      triggerRedisError('second failure');

      expect(warn).toHaveBeenCalledTimes(2);
    });
  });
});
