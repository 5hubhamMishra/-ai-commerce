import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CompleteReturnDto } from './dto/complete-return.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { ListReturnsQueryDto } from './dto/list-returns-query.dto';
import { RejectReturnDto } from './dto/reject-return.dto';
import { ReturnsService } from './returns.service';

const RETURN_REVIEW_ROLES = [
  Role.SUPPORT_AGENT,
  Role.INVENTORY_MANAGER,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  // ---- Admin ----------------------------------------------------------------
  // Registered before ':id' so "admin" is matched literally.

  @Roles(...RETURN_REVIEW_ROLES)
  @Get('admin')
  adminList(@Query() query: ListReturnsQueryDto) {
    return this.returnsService.listAdmin(query.status);
  }

  @Roles(...RETURN_REVIEW_ROLES)
  @Get('admin/:id')
  adminDetail(@Param('id') id: string) {
    return this.returnsService.getAdminDetail(id);
  }

  @Roles(...RETURN_REVIEW_ROLES)
  @Post('admin/:id/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.returnsService.approve(user.id, id);
  }

  @Roles(...RETURN_REVIEW_ROLES)
  @Post('admin/:id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectReturnDto,
  ) {
    return this.returnsService.reject(user.id, id, dto);
  }

  @Roles(...RETURN_REVIEW_ROLES)
  @Post('admin/:id/schedule-pickup')
  schedulePickup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.returnsService.schedulePickup(user.id, id);
  }

  @Roles(...RETURN_REVIEW_ROLES)
  @Post('admin/:id/mark-picked-up')
  markPickedUp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.returnsService.markPickedUp(user.id, id);
  }

  @Roles(...RETURN_REVIEW_ROLES)
  @Post('admin/:id/start-inspection')
  startInspection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.returnsService.startInspection(user.id, id);
  }

  @Roles(...RETURN_REVIEW_ROLES)
  @Post('admin/:id/complete')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CompleteReturnDto,
  ) {
    return this.returnsService.complete(user.id, id, dto);
  }

  // ---- Customer -------------------------------------------------------------

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReturnDto) {
    return this.returnsService.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.returnsService.listForUser(user.id);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.returnsService.getForUser(user, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.returnsService.cancel(user, id);
  }
}
