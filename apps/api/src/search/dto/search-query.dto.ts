import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SEARCH_SORT_OPTIONS = [
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
  'name_asc',
] as const;
export type SearchSort = (typeof SEARCH_SORT_OPTIONS)[number];

export class SearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsIn(SEARCH_SORT_OPTIONS)
  sort?: SearchSort;

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

  /** Only ever used to attribute a search for analytics when the caller is
   *  anonymous — declared here, not as a separate @Query() param, so the
   *  global ValidationPipe's forbidNonWhitelisted check doesn't reject a
   *  request that legitimately sends it alongside `q` (see Phase 7's
   *  RecommendationsController fix for the exact same class of bug). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  anonymousId?: string;
}
