import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ReturnReason, ReturnResolution } from '@prisma/client';

export class ReturnLineItemDto {
  @IsUUID()
  orderItemId!: string;

  @Type(() => Number)
  @Min(1)
  @Max(999)
  quantity!: number;
}

export class CreateReturnDto {
  @IsUUID()
  orderId!: string;

  @IsEnum(ReturnReason)
  reason!: ReturnReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reasonNote?: string;

  @IsEnum(ReturnResolution)
  resolution!: ReturnResolution;

  // Required only when resolution = EXCHANGE.
  @ValidateIf(
    (dto: CreateReturnDto) => dto.resolution === ReturnResolution.EXCHANGE,
  )
  @IsUUID()
  desiredVariantId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineItemDto)
  items!: ReturnLineItemDto[];
}
