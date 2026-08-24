import { EventsService } from './events.service';

describe('EventsService aggregation status', () => {
  let service: EventsService;
  let prisma: {
    behavioralEvent: {
      count: jest.Mock;
      aggregate: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      behavioralEvent: {
        count: jest.fn().mockResolvedValue(10),
        aggregate: jest.fn(),
      },
    };

    service = new EventsService(
      prisma as never,
      { enqueue: jest.fn() } as never,
      { getForUser: jest.fn() } as never,
    );
  });

  it('reports unprocessed behavioral-event backlog age from receivedAt', async () => {
    const oldest = new Date('2026-08-25T00:00:00.000Z');
    const newest = new Date('2026-08-25T00:04:00.000Z');
    const newestProcessed = new Date('2026-08-25T00:03:00.000Z');
    prisma.behavioralEvent.aggregate
      .mockResolvedValueOnce({
        _count: { _all: 3 },
        _min: { receivedAt: oldest },
        _max: { receivedAt: newest },
      })
      .mockResolvedValueOnce({
        _max: { processedAt: newestProcessed },
      });

    await expect(
      service.getAggregationStatus(new Date('2026-08-25T00:05:00.000Z')),
    ).resolves.toEqual({
      totalEvents: 10,
      unprocessedEvents: 3,
      oldestUnprocessedReceivedAt: oldest,
      newestUnprocessedReceivedAt: newest,
      oldestUnprocessedAgeMs: 5 * 60 * 1000,
      newestProcessedAt: newestProcessed,
    });
    expect(prisma.behavioralEvent.aggregate).toHaveBeenCalledWith({
      where: { processedAt: null },
      _count: { _all: true },
      _min: { receivedAt: true },
      _max: { receivedAt: true },
    });
    expect(prisma.behavioralEvent.aggregate).toHaveBeenCalledWith({
      where: { processedAt: { not: null } },
      _max: { processedAt: true },
    });
  });

  it('returns null age fields when no behavioral events are waiting for aggregation', async () => {
    prisma.behavioralEvent.aggregate
      .mockResolvedValueOnce({
        _count: { _all: 0 },
        _min: { receivedAt: null },
        _max: { receivedAt: null },
      })
      .mockResolvedValueOnce({
        _max: { processedAt: null },
      });

    await expect(service.getAggregationStatus()).resolves.toEqual({
      totalEvents: 10,
      unprocessedEvents: 0,
      oldestUnprocessedReceivedAt: null,
      newestUnprocessedReceivedAt: null,
      oldestUnprocessedAgeMs: null,
      newestProcessedAt: null,
    });
  });
});
