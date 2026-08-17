import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAddressDto } from './dto/create-address.dto';
import type { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const existingCount = await tx.address.count({ where: { userId } });
      return tx.address.create({
        data: {
          ...dto,
          userId,
          isDefault: dto.isDefault ?? existingCount === 0,
        },
      });
    });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    await this.assertOwnership(userId, id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.address.update({ where: { id }, data: dto });
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.assertOwnership(userId, id);
    await this.prisma.address.delete({ where: { id } });
  }

  /** Same not-found response whether the address doesn't exist or belongs to someone
   *  else — never confirms another user's address ID exists (IDOR/BOLA defense). */
  private async assertOwnership(userId: string, id: string) {
    const address = await this.prisma.address.findUnique({ where: { id } });
    if (!address || address.userId !== userId) {
      throw new NotFoundException({
        code: 'ADDRESS_NOT_FOUND',
        message: 'Address not found.',
      });
    }
    return address;
  }
}
