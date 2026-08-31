import { ReplacementStatus } from '@prisma/client';
import { ReplacementsService } from './replacements.service';

describe('ReplacementsService fulfillment', () => {
  it('does not dispatch when another request wins the replacement status claim', async () => {
    const replacement = {
      id: 'replacement-1',
      returnRequestId: 'return-1',
      orderId: 'order-1',
      status: ReplacementStatus.APPROVED,
      carrier: null,
      trackingNumber: null,
      createdAt: new Date(),
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const audit = { record: jest.fn() };
    const service = new ReplacementsService(
      {
        replacement: {
          findUnique: jest.fn().mockResolvedValue(replacement),
          updateMany,
        },
      } as never,
      {} as never,
      audit as never,
    );

    await expect(
      service.dispatch('admin-1', 'replacement-1', {
        carrier: 'DHL',
        trackingNumber: 'TRACK-1',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REPLACEMENT_STATUS_CHANGED' }),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'replacement-1', status: ReplacementStatus.APPROVED },
      data: {
        status: ReplacementStatus.SHIPPED,
        carrier: 'DHL',
        trackingNumber: 'TRACK-1',
      },
    });
    expect(audit.record).not.toHaveBeenCalled();
  });
});
