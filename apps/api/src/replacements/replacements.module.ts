import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ReplacementsController } from './replacements.controller';
import { ReplacementsService } from './replacements.service';

@Module({
  imports: [OrdersModule],
  controllers: [ReplacementsController],
  providers: [ReplacementsService],
  exports: [ReplacementsService],
})
export class ReplacementsModule {}
