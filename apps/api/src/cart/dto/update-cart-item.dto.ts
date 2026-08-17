import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateCartItemDto {
  // 0 or below removes the line (mirrors apps/web's updateCartQuantity behavior).
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  quantity!: number;
}
