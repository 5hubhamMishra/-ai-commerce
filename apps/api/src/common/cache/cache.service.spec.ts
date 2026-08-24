import { CacheService } from './cache.service';

describe('CacheService failure modes', () => {
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    scan: jest.Mock;
    del: jest.Mock;
    quit: jest.Mock;
  };
  let service: CacheService;

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      scan: jest.fn(),
      del: jest.fn(),
      quit: jest.fn().mockResolvedValue('OK'),
    };
    service = new CacheService(redis as never);
  });

  it('treats Redis read failures as cache misses', async () => {
    redis.get.mockRejectedValue(new Error('redis down'));

    await expect(service.get('products:list')).resolves.toBeNull();
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
});
