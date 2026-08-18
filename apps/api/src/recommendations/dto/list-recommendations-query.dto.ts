import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListRecommendationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /** Only ever used to read an anonymous caller's own already-anonymous
   *  behavioral history back (see RecommendationsController doc comment) —
   *  declared here, not as a separate @Query() param, so the global
   *  ValidationPipe's forbidNonWhitelisted check doesn't reject requests
   *  that legitimately send it alongside `limit`. */
  @IsOptional()
  @IsString()
  anonymousId?: string;
}
