import {
  OrderStatus,
  Prisma,
  ReturnReason,
  ReturnResolution,
  ReturnStatus,
} from '@prisma/client';
import { ReturnsService } from './returns.service';

describe('ReturnsService', () => {
  it('rejects duplicate inspection entries', () => {
    const service = new ReturnsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const assertAllItemsInspected = (
      service as unknown as {
        assertAllItemsInspected: (
          items: { id: string }[],
          inspected: { returnRequestItemId: string }[],
        ) => void;
      }
    ).assertAllItemsInspected;

    expect(() =>
      assertAllItemsInspected.call(
        service,
        [{ id: 'return-item-1' }],
        [
          { returnRequestItemId: 'return-item-1' },
          { returnRequestItemId: 'return-item-1' },
        ],
      ),
    ).toThrow();
  });

  it('rejects duplicate order items before creating a return', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          userId: 'user-1',
          status: OrderStatus.DELIVERED,
          items: [{ id: 'item-1', quantity: 2, variantId: 'variant-1' }],
        }),
      },
      returnRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ReturnsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.create({ id: 'user-1' } as never, {
        orderId: 'order-1',
        reason: ReturnReason.OTHER,
        resolution: ReturnResolution.REFUND,
        items: [
          { orderItemId: 'item-1', quantity: 1 },
          { orderItemId: 'item-1', quantity: 1 },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RETURN_ITEM_DUPLICATE' }),
    });
  });

  it('keeps a return retryable when the refund provider declines it', async () => {
    const returnUpdateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const prisma = {
      returnRequest: { updateMany: returnUpdateMany },
      $transaction: jest.fn(),
    };
    const service = new ReturnsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {
        requestProviderRefund: jest.fn().mockResolvedValue({
          success: false,
          providerRefundRef: '',
          raw: {},
          failureReason: 'Provider declined refund',
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = service as unknown as {
      getRow: jest.Mock;
      findSucceededPayment: jest.Mock;
    };
    internals.getRow = jest.fn().mockResolvedValue({
      id: 'return-1',
      userId: 'user-1',
      status: 'INSPECTING',
      resolution: 'REFUND',
      order: { id: 'order-1', currency: 'INR' },
      items: [
        {
          id: 'return-item-1',
          quantity: 1,
          orderItem: {
            variantId: 'variant-1',
            warehouseId: 'warehouse-1',
            unitPrice: 100,
          },
        },
      ],
    });
    internals.findSucceededPayment = jest.fn().mockResolvedValue({
      id: 'payment-1',
      providerPaymentRef: 'pay-1',
      providerRef: 'order-ref-1',
      currency: 'INR',
    });

    await expect(
      service.complete('admin-1', 'return-1', {
        items: [
          {
            returnRequestItemId: 'return-item-1',
            condition: 'sealed',
            isDamaged: false,
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REFUND_FAILED' }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(returnUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'return-1', status: ReturnStatus.PROCESSING },
      data: { status: ReturnStatus.INSPECTING },
    });
  });

  it('can retry a return left processing by a failed finalization', async () => {
    const returnUpdateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const prisma = {
      returnRequest: { updateMany: returnUpdateMany },
      $transaction: jest.fn(),
    };
    const service = new ReturnsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {
        requestProviderRefund: jest.fn().mockResolvedValue({
          success: false,
          providerRefundRef: '',
          raw: {},
          failureReason: 'Provider declined refund',
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = service as unknown as {
      getRow: jest.Mock;
      findSucceededPayment: jest.Mock;
    };
    internals.getRow = jest.fn().mockResolvedValue({
      id: 'return-1',
      userId: 'user-1',
      status: ReturnStatus.PROCESSING,
      resolution: ReturnResolution.REFUND,
      order: { id: 'order-1', currency: 'INR' },
      items: [
        {
          id: 'return-item-1',
          quantity: 1,
          orderItem: {
            variantId: 'variant-1',
            warehouseId: 'warehouse-1',
            unitPrice: 100,
          },
        },
      ],
    });
    internals.findSucceededPayment = jest.fn().mockResolvedValue({
      id: 'payment-1',
      providerPaymentRef: 'pay-1',
      providerRef: 'order-ref-1',
      currency: 'INR',
    });

    await expect(
      service.complete('admin-1', 'return-1', {
        items: [
          {
            returnRequestItemId: 'return-item-1',
            condition: 'sealed',
            isDamaged: false,
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REFUND_FAILED' }),
    });
    expect(returnUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'return-1', status: ReturnStatus.PROCESSING },
      data: { status: ReturnStatus.PROCESSING },
    });
    expect(returnUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'return-1', status: ReturnStatus.PROCESSING },
      data: { status: ReturnStatus.INSPECTING },
    });
  });

  it('keeps a lower-priced exchange retryable when its refund is declined', async () => {
    const returnUpdateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const requestProviderRefund = jest.fn().mockResolvedValue({
      success: false,
      providerRefundRef: '',
      raw: {},
      failureReason: 'Provider declined refund',
    });
    const prisma = {
      returnRequest: { updateMany: returnUpdateMany },
      productVariant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'new-variant',
          price: 50,
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new ReturnsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { requestProviderRefund } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = service as unknown as {
      getRow: jest.Mock;
      findSucceededPayment: jest.Mock;
    };
    internals.getRow = jest.fn().mockResolvedValue({
      id: 'return-1',
      userId: 'user-1',
      status: ReturnStatus.INSPECTING,
      resolution: ReturnResolution.EXCHANGE,
      desiredVariantId: 'new-variant',
      order: { id: 'order-1', currency: 'INR' },
      items: [
        {
          id: 'return-item-1',
          quantity: 1,
          orderItem: {
            variantId: 'old-variant',
            warehouseId: 'warehouse-1',
            unitPrice: 100,
          },
        },
      ],
    });
    internals.findSucceededPayment = jest.fn().mockResolvedValue({
      id: 'payment-1',
      providerPaymentRef: 'pay-1',
      providerRef: 'order-ref-1',
      currency: 'INR',
    });

    await expect(
      service.complete('admin-1', 'return-1', {
        items: [
          {
            returnRequestItemId: 'return-item-1',
            condition: 'sealed',
            isDamaged: false,
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REFUND_FAILED' }),
    });
    expect(requestProviderRefund).toHaveBeenCalledWith(
      'pay-1',
      50,
      'INR',
      'Exchange price difference (lower-priced item)',
      'exchange-return-1',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(returnUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'return-1', status: ReturnStatus.PROCESSING },
      data: { status: ReturnStatus.INSPECTING },
    });
  });

  it('does not restock when another completion wins the return claim', async () => {
    const restockReturnedItems = jest.fn();
    const markReturned = jest.fn();
    const returnUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      returnRequest: { updateMany: returnUpdateMany },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({
          returnRequest: { updateMany: returnUpdateMany },
          returnRequestItem: { update: jest.fn() },
        }),
      ),
    };
    const service = new ReturnsService(
      prisma as never,
      {} as never,
      { restockReturnedItems } as never,
      { markReturned } as never,
      {
        requestProviderRefund: jest.fn().mockResolvedValue({
          success: true,
          providerRefundRef: 'refund-1',
          raw: {},
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = service as unknown as {
      getRow: jest.Mock;
      findSucceededPayment: jest.Mock;
    };
    internals.getRow = jest.fn().mockResolvedValue({
      id: 'return-1',
      userId: 'user-1',
      status: ReturnStatus.INSPECTING,
      resolution: ReturnResolution.REFUND,
      order: { id: 'order-1', currency: 'INR' },
      items: [
        {
          id: 'return-item-1',
          quantity: 1,
          orderItem: {
            variantId: 'variant-1',
            warehouseId: 'warehouse-1',
            unitPrice: 100,
          },
        },
      ],
    });
    internals.findSucceededPayment = jest.fn().mockResolvedValue({
      id: 'payment-1',
      providerPaymentRef: 'pay-1',
      providerRef: 'order-ref-1',
      currency: 'INR',
    });

    await expect(
      service.complete('admin-1', 'return-1', {
        items: [
          {
            returnRequestItemId: 'return-item-1',
            condition: 'sealed',
            isDamaged: false,
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RETURN_STATUS_CHANGED' }),
    });
    expect(restockReturnedItems).not.toHaveBeenCalled();
    expect(markReturned).not.toHaveBeenCalled();
  });

  it('does not close a return when another request wins cancellation', async () => {
    const markReturnClosed = jest.fn();
    const returnUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({ returnRequest: { updateMany: returnUpdateMany } }),
      ),
    };
    const service = new ReturnsService(
      prisma as never,
      {} as never,
      {} as never,
      { markReturnClosed } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    (service as unknown as { getOwnedRow: jest.Mock }).getOwnedRow = jest
      .fn()
      .mockResolvedValue({
        id: 'return-1',
        userId: 'user-1',
        orderId: 'order-1',
        status: ReturnStatus.REQUESTED,
      });

    await expect(
      service.cancel({ id: 'user-1' } as never, 'return-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RETURN_STATUS_CHANGED' }),
    });
    expect(markReturnClosed).not.toHaveBeenCalled();
  });

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

  it('blocks a new return while an earlier completion is processing', async () => {
    const create = jest.fn();
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order1',
          userId: 'user1',
          status: OrderStatus.DELIVERED,
          items: [],
        }),
      },
      returnRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'return-1',
          status: ReturnStatus.PROCESSING,
        }),
        create,
      },
    };
    const service = new ReturnsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
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
        items: [],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RETURN_ALREADY_IN_PROGRESS' }),
    });
    expect(create).not.toHaveBeenCalled();
  });
});
