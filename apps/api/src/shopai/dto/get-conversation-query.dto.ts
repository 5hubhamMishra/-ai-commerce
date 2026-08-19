import { IsOptional, IsString } from 'class-validator';

export class GetConversationQueryDto {
  @IsOptional()
  @IsString()
  anonymousId?: string;
}
