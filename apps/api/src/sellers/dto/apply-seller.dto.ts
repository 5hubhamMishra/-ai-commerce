import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApplySellerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  businessName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
