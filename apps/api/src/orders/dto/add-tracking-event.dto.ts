import { ShipmentEventStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddTrackingEventDto {
  @IsEnum(ShipmentEventStatus)
  status!: ShipmentEventStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
