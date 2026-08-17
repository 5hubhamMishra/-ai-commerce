import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateHelpArticleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase, alphanumeric, and hyphen-separated',
  })
  slug?: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  category!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
