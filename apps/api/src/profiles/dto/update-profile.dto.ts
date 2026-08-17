import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /** Personalization on/off — a real, enforced privacy control, not cosmetic (spec: PRIVACY). */
  @IsOptional()
  @IsBoolean()
  personalizationEnabled?: boolean;

  @IsOptional()
  @IsObject()
  notificationPreferences?: Record<string, unknown>;
}
