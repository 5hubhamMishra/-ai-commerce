import { TicketCategory } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsEnum(TicketCategory)
  category!: TicketCategory;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}
