import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class InspectedItemDto {
  @IsUUID()
  returnRequestItemId!: string;

  @IsString()
  @MaxLength(100)
  condition!: string;

  // Damaged items go to the quantityDamaged bucket instead of back into sellable stock.
  @IsBoolean()
  isDamaged!: boolean;
}

export class CompleteReturnDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InspectedItemDto)
  items!: InspectedItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
