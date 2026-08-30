import { Module } from '@nestjs/common';
import { CustomerProfileService } from './customer-profile.service';
import { ActivityController, EventsController } from './events.controller';
import { EventsService } from './events.service';
import { BehavioralAggregationWorker } from './queue/behavioral-aggregation.worker';
import { BehavioralQueueService } from './queue/behavioral-queue.service';

@Module({
  controllers: [EventsController, ActivityController],
  providers: [
    EventsService,
    CustomerProfileService,
    BehavioralQueueService,
    BehavioralAggregationWorker,
  ],
  exports: [CustomerProfileService, BehavioralQueueService],
})
export class EventsModule {}
