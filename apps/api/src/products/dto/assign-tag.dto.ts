import { IsString, MaxLength, MinLength } from 'class-validator';

export class AssignTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;
}
