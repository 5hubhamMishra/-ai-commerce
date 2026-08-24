import { BehavioralEventType } from '@prisma/client';
import { CustomerProfileService } from './customer-profile.service';

describe('CustomerProfileService failure modes', () => {
  it('creates or loads a user profile atomically while applying an event', async () => {
    const event = {
      id: 'event-1',
      userId: 'user-1',
      anonymousId: 'anon-1',
      eventType: BehavioralEventType.CATEGORY_VIEWED,
      entityId: null,
      occurredAt: new Date('2026-08-25T00:00:00.000Z'),
      processedAt: null,
    };
    const profile = {
      id: 'profile-1',
      categoryViewCounts: {},
      categoryCartCounts: {},
      categoryPurchaseCounts: {},
      brandViewCounts: {},
      priceObservedMin: null,
      priceObservedMax: null,
      eventCount: 0,
      orderCount: 0,
      lastEventAt: null,
    };
    const tx = {
      customerProfile: {
        upsert: jest.fn().mockResolvedValue(profile),
        update: jest.fn().mockResolvedValue({}),
      },
      behavioralEvent: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      behavioralEvent: {
        findUnique: jest.fn().mockResolvedValue(event),
      },
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new CustomerProfileService(prisma as never);

    await service.applyEvent('event-1');

    expect(tx.customerProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1' },
      update: {},
    });
    expect(tx.customerProfile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: expect.objectContaining({
        eventCount: { increment: 1 },
        lastEventAt: event.occurredAt,
      }),
    });
  });

  it('creates or loads an anonymous profile atomically while applying an event', async () => {
    const event = {
      id: 'event-1',
      userId: null,
      anonymousId: 'anon-1',
      eventType: BehavioralEventType.CATEGORY_VIEWED,
      entityId: null,
      occurredAt: new Date('2026-08-25T00:00:00.000Z'),
      processedAt: null,
    };
    const profile = {
      id: 'profile-1',
      categoryViewCounts: {},
      categoryCartCounts: {},
      categoryPurchaseCounts: {},
      brandViewCounts: {},
      priceObservedMin: null,
      priceObservedMax: null,
      eventCount: 0,
      orderCount: 0,
      lastEventAt: null,
    };
    const tx = {
      customerProfile: {
        upsert: jest.fn().mockResolvedValue(profile),
        update: jest.fn().mockResolvedValue({}),
      },
      behavioralEvent: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      behavioralEvent: {
        findUnique: jest.fn().mockResolvedValue(event),
      },
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new CustomerProfileService(prisma as never);

    await service.applyEvent('event-1');

    expect(tx.customerProfile.upsert).toHaveBeenCalledWith({
      where: { anonymousId: 'anon-1' },
      create: { anonymousId: 'anon-1' },
      update: {},
    });
  });
});
