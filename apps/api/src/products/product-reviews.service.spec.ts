import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderStatus, Prisma, ProductStatus } from '@prisma/client';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductReviewsService } from './product-reviews.service';

describe('ProductReviewsService', () => {
  let service: ProductReviewsService;
  let events: { productChanged: jest.Mock };
  let prisma: {
    product: { findFirst: jest.Mock };
    order: { findUnique: jest.Mock };
    orderItem: { findFirst: jest.Mock };
    orderStateHistory: { findFirst: jest.Mock };
    productReview: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
    };
  };

  const user = { id: 'user1', email: 'a@example.com', roles: [] };
  const createdAt = new Date('2026-08-24T10:00:00.000Z');
  const updatedAt = new Date('2026-08-24T10:01:00.000Z');

  beforeEach(async () => {
    events = { productChanged: jest.fn() };
    prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: 'product1' }),
      },
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'order1', userId: 'user1' }),
      },
      orderItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'item1' }),
      },
      orderStateHistory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'history1' }),
      },
      productReview: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'review1',
          rating: 5,
          title: 'Excellent',
          body: 'Works perfectly.',
          createdAt,
          updatedAt,
          user: { name: 'Asha' },
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'review1',
            rating: 5,
            title: 'Excellent',
            body: 'Works perfectly.',
            createdAt,
            updatedAt,
            user: { name: 'Asha' },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _avg: { rating: 5 }, _count: { _all: 1 } }),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        ProductReviewsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CatalogEventsService, useValue: events },
      ],
    }).compile();

    service = module.get(ProductReviewsService);
  });

  it('creates a verified-purchase review after delivery', async () => {
    const review = await service.create(user, 'velvet-bag', {
      orderId: 'order1',
      rating: 5,
      title: 'Excellent',
      body: 'Works perfectly.',
    });

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: {
        slug: 'velvet-bag',
        deletedAt: null,
        status: ProductStatus.ACTIVE,
      },
      select: { id: true },
    });
    expect(prisma.orderItem.findFirst).toHaveBeenCalledWith({
      where: {
        orderId: 'order1',
        variant: { productId: 'product1' },
      },
    });
    expect(prisma.orderStateHistory.findFirst).toHaveBeenCalledWith({
      where: { orderId: 'order1', toStatus: OrderStatus.DELIVERED },
    });
    expect(prisma.productReview.create).toHaveBeenCalledWith({
      data: {
        productId: 'product1',
        userId: 'user1',
        orderId: 'order1',
        rating: 5,
        title: 'Excellent',
        body: 'Works perfectly.',
      },
      include: { user: { select: { name: true } } },
    });
    expect(events.productChanged).toHaveBeenCalledWith('product1', 'updated');
    expect(review).toEqual({
      id: 'review1',
      rating: 5,
      title: 'Excellent',
      body: 'Works perfectly.',
      authorName: 'Asha',
      verifiedPurchase: true,
      createdAt,
      updatedAt,
    });
  });

  it('hides orders that do not belong to the caller', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order1',
      userId: 'other',
    });

    await expect(
      service.create(user, 'velvet-bag', { orderId: 'order1', rating: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.productReview.create).not.toHaveBeenCalled();
  });

  it('rejects reviews when the order did not include the product', async () => {
    prisma.orderItem.findFirst.mockResolvedValue(null);

    await expect(
      service.create(user, 'velvet-bag', { orderId: 'order1', rating: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects reviews before the order is delivered', async () => {
    prisma.orderStateHistory.findFirst.mockResolvedValue(null);

    await expect(
      service.create(user, 'velvet-bag', { orderId: 'order1', rating: 5 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects duplicate reviews for the same product order and user', async () => {
    prisma.productReview.findUnique.mockResolvedValue({ id: 'review1' });

    await expect(
      service.create(user, 'velvet-bag', { orderId: 'order1', rating: 5 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a concurrent unique review race to the duplicate conflict', async () => {
    prisma.productReview.findUnique.mockResolvedValue(null);
    prisma.productReview.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create(user, 'velvet-bag', { orderId: 'order1', rating: 5 }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REVIEW_ALREADY_EXISTS' }),
    });
    expect(events.productChanged).not.toHaveBeenCalled();
  });

  it('lists public reviews with an aggregate summary', async () => {
    await expect(service.listForProduct('velvet-bag', 2, 10)).resolves.toEqual({
      items: [
        {
          id: 'review1',
          rating: 5,
          title: 'Excellent',
          body: 'Works perfectly.',
          authorName: 'Asha',
          verifiedPurchase: true,
          createdAt,
          updatedAt,
        },
      ],
      total: 1,
      page: 2,
      pageSize: 10,
      summary: { average: 5, count: 1 },
    });
    expect(prisma.productReview.findMany).toHaveBeenCalledWith({
      where: { productId: 'product1' },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
  });
});
