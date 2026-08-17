import { TicketStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListTicketsQueryDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;
}
