import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.toPublic(
      await this.usersService.findById(user.id),
    );
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.toPublic(
      await this.usersService.updateName(user.id, dto.name),
    );
  }

  /** Privacy controls (spec PRIVACY: "data export", "account deletion"). */
  @Get('me/export')
  exportData(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.exportData(user.id);
  }

  @Delete('me')
  @HttpCode(204)
  async deleteMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
  ) {
    await this.usersService.deleteAccount(user.id, dto.password);
  }

  /** Admin-only directory listing — RBAC enforced server-side (spec: AUTHORIZATION). */
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Get()
  async list(@Query() query: ListUsersQueryDto) {
    const result = await this.usersService.list({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
    return {
      ...result,
      items: result.items.map((u) => this.usersService.toPublic(u)),
    };
  }
}
