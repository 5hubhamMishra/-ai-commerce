import { Type } from 'class-transformer';
import {
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Admin-initiated refund not tied to a return (e.g. goodwill, cancellation
 *  adjustment). Return-driven refunds are created internally by RefundsService
 *  from ReturnsService.complete() instead — see ADR for the reasoning. */
export class CreateRefundDto {
  @IsUUID()
  orderId!: string;

  @Type(() => Number)
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
