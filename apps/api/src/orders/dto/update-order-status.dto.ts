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
}
