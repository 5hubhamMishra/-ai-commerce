import {
  OrderStatus,
  Prisma,
  ReturnReason,
  ReturnResolution,
} from '@prisma/client';
import { ReturnsService } from './returns.service';

describe('ReturnsService', () => {
  it('maps a concurrent active-return race to the duplicate conflict', async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order1',
          userId: 'user1',
          status: OrderStatus.DELIVERED,
          items: [{ id: 'item1', quantity: 1, variantId: 'variant1' }],
        }),
      },
      returnRequest: { findFirst: jest.fn().mockResolvedValue(null), create },
      orderStateHistory: {
        findFirst: jest.fn().mockResolvedValue({ createdAt: new Date() }),
      },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    } as unknown as ConstructorParameters<typeof ReturnsService>[0];
    const service = new ReturnsService(
      prisma,
      { get: jest.fn().mockReturnValue(30) } as never,
      {} as never,
      { markReturnRequested: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.create({ id: 'user1' } as never, {
        orderId: 'order1',
        reason: ReturnReason.OTHER,
        resolution: ReturnResolution.REFUND,
        items: [{ orderItemId: 'item1', quantity: 1 }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RETURN_ALREADY_IN_PROGRESS' }),
    });
    expect(create).toHaveBeenCalled();
  });
});
