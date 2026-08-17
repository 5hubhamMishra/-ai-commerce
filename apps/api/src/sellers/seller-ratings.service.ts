import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { CreateRatingDto } from './dto/create-rating.dto';

@Injectable()
export class SellerRatingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    user: AuthenticatedUser,
    sellerId: string,
    dto: CreateRatingDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });
    if (!order || order.userId !== user.id) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }

    const hasSellerItem = await this.prisma.orderItem.findFirst({
      where: { orderId: dto.orderId, sellerId },
    });
    if (!hasSellerItem) {
      throw new NotFoundException({
        code: 'SELLER_NOT_IN_ORDER',
        message: 'This seller did not fulfil any item in that order.',
      });
    }

    // Same "was it ever actually delivered" check ReturnsService uses for
    // return-window eligibility — a rating shouldn't be possible before
    // anything was fulfilled, but should remain possible afterward even if
    // the order later moved into a return/refund state.
    const deliveredEvent = await this.prisma.orderStateHistory.findFirst({
      where: { orderId: dto.orderId, toStatus: OrderStatus.DELIVERED },
    });
    if (!deliveredEvent) {
      throw new ConflictException({
        code: 'ORDER_NOT_DELIVERED',
        message: 'You can only rate a seller after your order is delivered.',
      });
    }

    const existing = await this.prisma.sellerRating.findUnique({
      where: { sellerId_orderId: { sellerId, orderId: dto.orderId } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ALREADY_RATED',
        message: 'You have already rated this seller for this order.',
      });
    }

    const rating = await this.prisma.sellerRating.create({
      data: {
        sellerId,
        userId: user.id,
        orderId: dto.orderId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });
    return rating;
  }

  async listForSeller(sellerId: string, page: number, pageSize: number) {
    const [rows, total] = await Promise.all([
      this.prisma.sellerRating.findMany({
        where: { sellerId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sellerRating.count({ where: { sellerId } }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }
}
