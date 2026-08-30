import { ProductStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { parseBooleanQueryParam } from '../../common/validation/query-transformers';

export const PRODUCT_SORT_OPTIONS = ['newest', 'name_asc', 'featured'] as const;
export type ProductSort = (typeof PRODUCT_SORT_OPTIONS)[number];

export class ListProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Transform(({ value }) => parseBooleanQueryParam(value))
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsIn(PRODUCT_SORT_OPTIONS)
  sort?: ProductSort;

  /** Admin listing only — ignored by the public endpoint, which always forces ACTIVE. */
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
