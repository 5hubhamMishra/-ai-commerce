import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateSpecificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  group?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  value!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
