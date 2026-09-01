import { CacheService } from '../common/cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ProfilesService } from './profiles.service';

describe('ProfilesService', () => {
  it('invalidates personalized recommendations when consent changes', async () => {
    const profile = {
      id: 'profile-1',
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    };
    const prisma = {
      profile: {
        findUnique: jest.fn().mockResolvedValue(profile),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(profile),
      },
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

  it('rejects a stale profile update', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      profile: {
        findUnique: jest.fn().mockResolvedValue({ updatedAt }),
        updateMany,
      },
    };
    const service = new ProfilesService(prisma as never, {} as never);

    await expect(
      service.update('user-1', { phone: '+911234567890' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROFILE_CHANGED' }),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', updatedAt },
      data: {
        phone: '+911234567890',
        notificationPreferences: undefined,
      },
    });
  });

  it('rejects a concurrent first profile update', async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const prisma = {
      profile: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    };
    const service = new ProfilesService(prisma as never, {} as never);

    await expect(
      service.update('user-1', { phone: '+911234567890' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PROFILE_CHANGED' }),
    });
  });
});
