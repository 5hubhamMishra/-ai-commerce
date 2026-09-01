import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CACHE_PREFIX } from '../common/cache/cache-keys';
import { CacheService } from '../common/cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getForUser(userId: string) {
    return this.prisma.profile.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async update(userId: string, dto: UpdateProfileDto) {
    // notificationPreferences is validated as a plain object by class-validator (@IsObject())
    // before this ever runs — the cast just bridges to Prisma's stricter JSON-value type.
    const data = {
      ...dto,
      notificationPreferences: dto.notificationPreferences as
        Prisma.InputJsonValue | undefined,
    };
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
    });
    let profile: Awaited<
      ReturnType<typeof this.prisma.profile.findUniqueOrThrow>
    >;
    try {
      if (existing) {
        const claimed = await this.prisma.profile.updateMany({
          where: { userId, updatedAt: existing.updatedAt },
          data,
        });
        if (claimed.count === 0) {
          throw new ConflictException({
            code: 'PROFILE_CHANGED',
            message: 'The profile changed before this update could be applied.',
          });
        }
        profile = await this.prisma.profile.findUniqueOrThrow({
          where: { userId },
        });
      } else {
        profile = await this.prisma.profile.create({
          data: { userId, ...data },
        });
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'PROFILE_CHANGED',
          message:
            'The profile was created before this update could be applied.',
        });
      }
      throw error;
    }
    if (dto.personalizationEnabled !== undefined) {
      await this.cache.delByPrefix(
        `${CACHE_PREFIX.RECOMMENDATIONS}personalized:${userId}:`,
      );
    }
    return profile;
  }
}
