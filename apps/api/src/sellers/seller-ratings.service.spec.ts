import { Prisma } from '@prisma/client';
import { SellerRatingsService } from './seller-ratings.service';

describe('SellerRatingsService', () => {
  it('maps a concurrent unique rating race to the duplicate conflict', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order1',
          userId: 'user1',
        }),
      },
      orderItem: { findFirst: jest.fn().mockResolvedValue({ id: 'item1' }) },
      orderStateHistory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'history1' }),
      },
      sellerRating: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        ),
      },
    };
    const service = new SellerRatingsService(prisma as never);

    await expect(
      service.create(
        { id: 'user1', email: 'a@example.com', roles: [] },
        'seller1',
        { orderId: 'order1', rating: 5 },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ALREADY_RATED' }),
    });
  });
});
