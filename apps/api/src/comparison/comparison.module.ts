import { Module } from '@nestjs/common';
import { ComparisonController } from './comparison.controller';
import { ComparisonService } from './comparison.service';

@Module({
  controllers: [ComparisonController],
  providers: [ComparisonService],
  // Consumed directly by ShopAI's compare_products tool (Phase 9) — same
  // "export what a later phase needs" precedent as ProductsModule (Phase 5).
  exports: [ComparisonService],
})
export class ComparisonModule {}
