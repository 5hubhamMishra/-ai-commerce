import { ConfigService } from '@nestjs/config';
import { BehavioralQueueService } from './behavioral-queue.service';

describe('BehavioralQueueService failure modes', () => {
  it('does not throw into event ingestion when Redis/BullMQ enqueue fails', async () => {
    const service = new BehavioralQueueService({} as ConfigService);
    (
      service as unknown as {
        queue: { add: jest.Mock };
      }
    ).queue = {
      add: jest.fn().mockRejectedValue(new Error('redis down')),
    };

    await expect(
      service.enqueue({ eventId: 'event-1' }),
    ).resolves.toBeUndefined();
  });
});
