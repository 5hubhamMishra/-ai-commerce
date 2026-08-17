import { BehavioralEventType, EventSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class TrackEventDto {
  /** Client-generated — duplicate prevention relies on a retry reusing this
   *  exact id, not a separate dedup check (see schema.prisma). */
  @IsUUID()
  eventId!: string;

  @IsEnum(BehavioralEventType)
  eventType!: BehavioralEventType;

  @IsString()
  @MaxLength(100)
  anonymousId!: string;

  @IsString()
  @MaxLength(100)
  sessionId!: string;

  @IsEnum(EventSource)
  source!: EventSource;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  /** Never put PII in here — this is a contract, not something the server
   *  can structurally enforce beyond keeping the object small and opaque. */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  schemaVersion?: number;

  @IsDateString()
  occurredAt!: string;
}
