import { OrderStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ADMIN_SETTABLE_STATUSES } from '../order-state-machine';

export class UpdateOrderStatusDto {
  @IsIn(ADMIN_SETTABLE_STATUSES)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  // Required (validated in OrdersService, not here — depends on `status`) when
  // status === SHIPPED: the dispatch event that starts the tracking timeline.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  carrier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  trackingNumber?: string;
}
