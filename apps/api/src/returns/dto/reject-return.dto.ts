import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectReturnDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
