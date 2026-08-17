import { IsInt, IsOptional, Min } from 'class-validator';

/** Sets absolute quantity counts (stock takes, initial stocking) — not deltas.
 *  Atomic reserve/commit/release transactions belong to Phase 3 (checkout). */
export class SetInventoryDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  quantityOnHand?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityReserved?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityCommitted?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityDamaged?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityIncoming?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderPoint?: number;
}
