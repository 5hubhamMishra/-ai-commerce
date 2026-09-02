import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const MAX_MESSAGE_LENGTH = 2000;

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/, { message: 'message must contain non-whitespace characters' })
  @MaxLength(MAX_MESSAGE_LENGTH)
  message!: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  /** Only ever used to identify an anonymous caller's own conversation —
   *  declared here, not a separate @Query()/@Body() field elsewhere, for
   *  the same forbidNonWhitelisted reason as every other anonymousId field
   *  in this codebase since Phase 7. */
  @IsOptional()
  @IsString()
  anonymousId?: string;
}
