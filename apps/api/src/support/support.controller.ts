import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { SupportService } from './support.service';

const STAFF_ROLES = [Role.SUPPORT_AGENT, Role.ADMIN, Role.SUPER_ADMIN];

@Controller('support/tickets')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // ---- Staff ------------------------------------------------------------

  @Roles(...STAFF_ROLES)
  @Get('admin')
  adminList(@Query() query: ListTicketsQueryDto) {
    return this.supportService.listAdmin(query.status);
  }

  @Roles(...STAFF_ROLES)
  @Get('admin/:id')
  adminDetail(@Param('id') id: string) {
    return this.supportService.getAdminDetail(id);
  }

  @Roles(...STAFF_ROLES)
  @Patch('admin/:id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.supportService.updateStatus(user.id, id, dto);
  }

  // ---- Customer (staff also use the same reply endpoint — role-checked inside) ----

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTicketDto) {
    return this.supportService.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.supportService.listForUser(user.id);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.supportService.getForUser(user, id);
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.supportService.reply(user, id, dto);
  }
}
