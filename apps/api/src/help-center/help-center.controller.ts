import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateHelpArticleDto } from './dto/create-help-article.dto';
import { UpdateHelpArticleDto } from './dto/update-help-article.dto';
import { HelpCenterService } from './help-center.service';

const HELP_CENTER_WRITE_ROLES = [
  Role.CONTENT_MANAGER,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

@Controller('help-center')
export class HelpCenterController {
  constructor(private readonly helpCenterService: HelpCenterService) {}

  @Public()
  @Get('articles')
  list(@Query('category') category?: string) {
    return this.helpCenterService.listPublished(category);
  }

  // Registered before ':slug' so "admin" is matched literally.
  @Roles(...HELP_CENTER_WRITE_ROLES)
  @Get('articles/admin')
  adminList() {
    return this.helpCenterService.listAdmin();
  }

  @Public()
  @Get('articles/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.helpCenterService.getPublishedBySlug(slug);
  }

  @Roles(...HELP_CENTER_WRITE_ROLES)
  @Post('articles')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateHelpArticleDto,
  ) {
    return this.helpCenterService.create(dto, user.id);
  }

  @Roles(...HELP_CENTER_WRITE_ROLES)
  @Patch('articles/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateHelpArticleDto,
  ) {
    return this.helpCenterService.update(id, dto, user.id);
  }

  @Roles(...HELP_CENTER_WRITE_ROLES)
  @Delete('articles/:id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.helpCenterService.remove(id, user.id);
  }
}
