import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.profile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }
}
