import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

describe('OrdersService cancellation race', () => {
  it('does not release inventory when another request wins the status claim', async () => {
    const releaseReserved = jest.fn();
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          userId: 'user-1',
          status: OrderStatus.PENDING_PAYMENT,
          items: [
            { variantId: 'variant-1', warehouseId: 'warehouse-1', quantity: 1 },
          ],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new OrdersService(
      prisma as never,
      { releaseReserved } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.cancel({ id: 'user-1', roles: [] } as never, 'order-1', {
        reason: 'Changed my mind',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORDER_NOT_CANCELLABLE' }),
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: OrderStatus.PENDING_PAYMENT },
      data: {
        status: OrderStatus.CANCELLED,
        cancelReason: 'Changed my mind',
        cancelledAt: expect.any(Date),
      },
    });
    expect(releaseReserved).not.toHaveBeenCalled();
  });
});
