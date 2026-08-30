import { CacheService } from '../common/cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilesService } from './profiles.service';

describe('ProfilesService', () => {
  it('invalidates personalized recommendations when consent changes', async () => {
    const prisma = {
      profile: { upsert: jest.fn().mockResolvedValue({ id: 'profile-1' }) },
    };
    const cache = { delByPrefix: jest.fn().mockResolvedValue(undefined) };
    const service = new ProfilesService(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
    );

    await service.update('user-1', { personalizationEnabled: false });

    expect(cache.delByPrefix).toHaveBeenCalledWith(
      'recommendations:personalized:user-1:',
    );
  });
});
