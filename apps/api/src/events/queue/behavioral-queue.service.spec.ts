import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BehavioralQueueService } from './behavioral-queue.service';

describe('BehavioralQueueService failure modes', () => {
  const prisma = {
    behavioralEvent: { findMany: jest.fn() },
  } as unknown as PrismaService;

  it('does not create a Redis queue when Redis is disabled', async () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const service = new BehavioralQueueService(config, prisma);

    service.onModuleInit();

    await expect(
      service.enqueueMany([{ eventId: 'event-1' }]),
    ).resolves.toBeUndefined();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('does not throw into event ingestion when a bulk enqueue fails', async () => {
    const service = new BehavioralQueueService({} as ConfigService, prisma);
    (
      service as unknown as {
        queue: { addBulk: jest.Mock };
      }
    ).queue = {
      addBulk: jest.fn().mockRejectedValue(new Error('redis down')),
    };

    await expect(
      service.enqueueMany([{ eventId: 'event-1' }, { eventId: 'event-2' }]),
    ).resolves.toBeUndefined();
  });

  it('bulk-enqueues events with stable job ids', async () => {
    const service = new BehavioralQueueService({} as ConfigService, prisma);
    const addBulk = jest.fn().mockResolvedValue([]);
    (service as unknown as { queue: { addBulk: jest.Mock } }).queue = {
      addBulk,
    };

    await service.enqueueMany([{ eventId: 'event-1' }, { eventId: 'event-2' }]);

    expect(addBulk).toHaveBeenCalledWith([
      {
        name: 'aggregate',
        data: { eventId: 'event-1' },
        opts: { jobId: 'event-1' },
      },
      {
        name: 'aggregate',
        data: { eventId: 'event-2' },
        opts: { jobId: 'event-2' },
      },
    ]);
  });

  it('requeues unprocessed events with stable job ids', async () => {
    prisma.behavioralEvent.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]);
    const service = new BehavioralQueueService({} as ConfigService, prisma);
    const addBulk = jest.fn().mockResolvedValue([]);
    (service as unknown as { queue: { addBulk: jest.Mock } }).queue = {
      addBulk,
    };

    await expect(service.enqueuePending()).resolves.toBe(2);

    expect(addBulk).toHaveBeenCalledWith([
      {
        name: 'aggregate',
        data: { eventId: 'event-1' },
        opts: { jobId: 'event-1' },
      },
      {
        name: 'aggregate',
        data: { eventId: 'event-2' },
        opts: { jobId: 'event-2' },
      },
    ]);
  });

  it('does not throw when addBulk fails partway through requeueing', async () => {
    // Regression test: pending's count is reported in the catch block below the one that
    // finds it - it must be declared outside the try, not as a try-scoped const, or reading
    // it here throws its own "not defined" error and masks the real one.
    prisma.behavioralEvent.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]);
    const service = new BehavioralQueueService({} as ConfigService, prisma);
    (service as unknown as { queue: { addBulk: jest.Mock } }).queue = {
      addBulk: jest.fn().mockRejectedValue(new Error('redis down mid-requeue')),
    };

    await expect(service.enqueuePending()).resolves.toBe(0);
  });
});
