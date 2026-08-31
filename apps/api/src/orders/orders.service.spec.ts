import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

describe('OrdersService state claims', () => {
  it('rejects a mixed-currency cart before reserving inventory', async () => {
    const reserveForOrder = jest.fn();
    const tx = {
      cart: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          items: [
            {
              variantId: 'variant-1',
              quantity: 1,
              variant: {
                currency: 'INR',
                price: 100,
                deletedAt: null,
                isActive: true,
                product: {
                  name: 'Product 1',
                  deletedAt: null,
                  status: 'ACTIVE',
                  seller: null,
                },
              },
            },
            {
              variantId: 'variant-2',
              quantity: 1,
              variant: {
                currency: 'USD',
                price: 100,
                deletedAt: null,
                isActive: true,
                product: {
                  name: 'Product 2',
                  deletedAt: null,
                  status: 'ACTIVE',
                  seller: null,
                },
              },
            },
          ],
        }),
      },
    };
    const service = new OrdersService(
      {
        $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
          callback(tx),
        ),
      } as never,
      { reserveForOrder } as never,
      {
        quoteForCart: jest
          .fn()
          .mockResolvedValue([{ method: 'STANDARD', fee: 10 }]),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const createOrderTransactional = (
      service as unknown as {
        createOrderTransactional: (
          userId: string,
          dto: unknown,
        ) => Promise<unknown>;
      }
    ).createOrderTransactional;

    await expect(
      createOrderTransactional.call(service, 'user-1', {
        addressId: 'address-1',
        shippingMethod: 'STANDARD',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MIXED_CURRENCY_CART' }),
    });
    expect(reserveForOrder).not.toHaveBeenCalled();
  });

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

  it('does not ship inventory when another request wins a fulfillment claim', async () => {
    const shipCommitted = jest.fn();
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          userId: 'user-1',
          status: OrderStatus.PACKED,
          items: [
            {
              variantId: 'variant-1',
              warehouseId: 'warehouse-1',
              quantity: 1,
              variant: { productId: 'product-1' },
            },
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
      { shipCommitted } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateStatusAdmin('admin-1', 'order-1', {
        status: OrderStatus.SHIPPED,
        carrier: 'DHL',
        trackingNumber: 'TRACK-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORDER_STATUS_CHANGED' }),
    });
    expect(shipCommitted).not.toHaveBeenCalled();
  });
});
