import { Module } from '@nestjs/common';
import { ExchangesModule } from '../exchanges/exchanges.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { RefundsModule } from '../refunds/refunds.module';
import { ReplacementsModule } from '../replacements/replacements.module';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [
    OrdersModule,
    InventoryModule,
    RefundsModule,
    ReplacementsModule,
    ExchangesModule,
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
