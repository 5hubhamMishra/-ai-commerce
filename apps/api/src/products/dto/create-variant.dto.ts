import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/\S/, { message: 'sku must contain visible text' })
  sku!: string;

  @Type(() => Number)
  @IsPositive()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(9999999999.99)
  price!: number;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(9999999999.99)
  compareAtPrice?: number | null;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weightGrams?: number;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  isDefault?: boolean;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  attributeValueIds?: string[];
}
