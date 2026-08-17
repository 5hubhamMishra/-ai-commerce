import { IsString, MaxLength, MinLength } from 'class-validator';

export class DispatchReplacementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  carrier!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  trackingNumber!: string;
}
