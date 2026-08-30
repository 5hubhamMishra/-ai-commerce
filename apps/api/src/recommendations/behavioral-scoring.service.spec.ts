import { BehavioralEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BehavioralScoringService } from './behavioral-scoring.service';

describe('BehavioralScoringService', () => {
  it('only reads events captured while personalization was enabled', async () => {
    const eligible = {
      eventType: BehavioralEventType.PRODUCT_VIEWED,
      entityId: 'product-1',
      occurredAt: new Date(),
    };
    const ineligible = {
      eventType: BehavioralEventType.PRODUCT_VIEWED,
      entityId: 'product-2',
      occurredAt: new Date(),
    };
    const prisma = {
      behavioralEvent: {
        findMany: jest
          .fn()
          .mockImplementation(
            (args: { where: { personalizationEligible?: boolean } }) =>
              Promise.resolve(
                args.where.personalizationEligible
                  ? [eligible]
                  : [eligible, ineligible],
              ),
          ),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-1',
            categoryId: 'category-1',
            brandId: null,
            variants: [{ price: 100 }],
          },
        ]),
      },
    };
    const service = new BehavioralScoringService(
      prisma as unknown as PrismaService,
    );

    const signal = await service.getAffinity({ userId: 'user-1' });

    expect(signal.eventCount).toBe(1);
    expect(signal.recentProductIds).toEqual(['product-1']);
    expect(prisma.behavioralEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ personalizationEligible: true }),
      }),
    );
  });
});
