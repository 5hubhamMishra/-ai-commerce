import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    const existing = await this.assertOwnership(userId, id);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.address.updateMany({
        where: { id, userId, updatedAt: existing.updatedAt },
        data: dto,
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: 'ADDRESS_CHANGED',
          message: 'The address changed before this update could be applied.',
        });
      }
      if (dto.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
      return tx.address.findUniqueOrThrow({ where: { id } });
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.assertOwnership(userId, id);
    // Orders reference their shipping address permanently (ON DELETE RESTRICT —
    // an order must always be able to show where it shipped to), so an address
    // with order history can't be deleted, only left alone.
    const orderCount = await this.prisma.order.count({
      where: { addressId: id },
    });
    if (orderCount > 0) {
      throw new ConflictException({
        code: 'ADDRESS_HAS_ORDERS',
        message:
          'This address is referenced by past orders and cannot be deleted.',
      });
    }
    try {
      await this.prisma.address.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException({
          code: 'ADDRESS_NOT_FOUND',
          message: 'Address not found.',
        });
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException({
          code: 'ADDRESS_HAS_ORDERS',
          message:
            'This address is referenced by past orders and cannot be deleted.',
        });
      }
      throw error;
    }
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
