import { IsInt, ValidateIf, Min, Max } from 'class-validator';

/** Sets absolute quantity counts (stock takes, initial stocking) — not deltas.
 *  Atomic reserve/commit/release transactions belong to Phase 3 (checkout). */
export class SetInventoryDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  quantityOnHand?: number;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  quantityReserved?: number;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  quantityCommitted?: number;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  quantityDamaged?: number;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  quantityIncoming?: number;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  reorderPoint?: number;
}
