import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ApplySellerDto {
  @IsString()
  @MinLength(2)
  @Matches(/\S/, { message: 'businessName must contain visible text' })
  @MaxLength(200)
  businessName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
