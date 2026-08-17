import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
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
