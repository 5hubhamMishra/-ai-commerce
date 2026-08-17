import { PartialType } from '@nestjs/mapped-types';
import { CreateHelpArticleDto } from './create-help-article.dto';

export class UpdateHelpArticleDto extends PartialType(CreateHelpArticleDto) {}
