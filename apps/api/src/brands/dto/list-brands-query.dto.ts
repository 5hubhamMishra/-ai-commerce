import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { parseBooleanQueryParam } from '../../common/validation/query-transformers';

export class ListBrandsQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseBooleanQueryParam(value))
  @IsBoolean()
  includeInactive?: boolean;

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
}
