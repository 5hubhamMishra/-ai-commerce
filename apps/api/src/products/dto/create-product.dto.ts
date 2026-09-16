import { ProductStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/, { message: 'name must contain visible text' })
  @MaxLength(200)
  name!: string;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase, alphanumeric, and hyphen-separated',
  })
  slug?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  @Matches(/\S/, { message: 'description must contain visible text' })
  description!: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
  brandId?: string | null;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  isFeatured?: boolean;
}
