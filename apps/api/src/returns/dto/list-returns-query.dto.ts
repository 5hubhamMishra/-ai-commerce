import { ReturnStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListReturnsQueryDto {
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;
}
