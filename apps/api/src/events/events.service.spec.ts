import { EventsService } from './events.service';

describe('EventsService aggregation status', () => {
  let service: EventsService;
  let prisma: {
    session: { upsert: jest.Mock };
    behavioralEvent: {
      count: jest.Mock;
      aggregate: jest.Mock;
      createMany: jest.Mock;
    };
  };
  let queue: { enqueue: jest.Mock };

  beforeEach(() => {
    prisma = {
      session: { upsert: jest.fn().mockResolvedValue({}) },
      behavioralEvent: {
        count: jest.fn().mockResolvedValue(10),
        aggregate: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    queue = { enqueue: jest.fn().mockResolvedValue(undefined) };

    service = new EventsService(
      prisma as never,
      queue as never,
      { getForUser: jest.fn() } as never,
    );
  });

  it('processes independent session and queue work concurrently for a batch', async () => {
    let releaseSessions!: () => void;
    let releaseQueue!: () => void;
    const sessionGate = new Promise<void>((resolve) => {
      releaseSessions = resolve;
    });
    const queueGate = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    prisma.session.upsert.mockReturnValue(sessionGate);
    queue.enqueue.mockReturnValue(queueGate);

    const tracking = service.track(undefined, {
      events: [
        {
          eventId: '00000000-0000-4000-8000-000000000001',
          eventType: 'PRODUCT_VIEWED',
          anonymousId: 'anonymous-1',
          sessionId: 'session-1',
          source: 'WEB',
          entityId: 'product-1',
          occurredAt: new Date().toISOString(),
        },
        {
          eventId: '00000000-0000-4000-8000-000000000002',
          eventType: 'PRODUCT_VIEWED',
          anonymousId: 'anonymous-2',
          sessionId: 'session-2',
          source: 'WEB',
          entityId: 'product-2',
          occurredAt: new Date().toISOString(),
        },
      ],
    } as never);

    await Promise.resolve();
    expect(prisma.session.upsert).toHaveBeenCalledTimes(2);
    expect(queue.enqueue).not.toHaveBeenCalled();

    releaseSessions();
    await new Promise((resolve) => setImmediate(resolve));
    expect(queue.enqueue).toHaveBeenCalledTimes(2);

    releaseQueue();
    await expect(tracking).resolves.toEqual({ accepted: 2 });
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
