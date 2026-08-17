import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AddTrackingEventDto } from './dto/add-tracking-event.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

const ORDER_FULFILLMENT_ROLES = [
  Role.INVENTORY_MANAGER,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];
const ORDER_VIEW_ROLES = [Role.SUPPORT_AGENT, Role.ADMIN, Role.SUPER_ADMIN];

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ---- Admin --------------------------------------------------------------
  // Registered before ':id' so "admin" is matched literally, not swallowed as an id.

  @Roles(...ORDER_VIEW_ROLES)
  @Get('admin')
  adminList(@Query() query: ListOrdersQueryDto) {
    return this.ordersService.listAdmin(query);
  }

  @Roles(...ORDER_VIEW_ROLES)
  @Get('admin/:id')
  adminDetail(@Param('id') id: string) {
    return this.ordersService.getAdminDetail(id);
  }

  @Roles(...ORDER_FULFILLMENT_ROLES)
  @Patch('admin/:id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatusAdmin(user.id, id, dto);
  }

  @Roles(...ORDER_FULFILLMENT_ROLES)
  @Post('admin/:id/tracking-events')
  addTrackingEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddTrackingEventDto,
  ) {
    return this.ordersService.addTrackingEvent(
      user.id,
      id,
      dto.status,
      dto.location,
      dto.description,
    );
  }

  // ---- Customer -------------------------------------------------------------

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.ordersService.create(user.id, dto, idempotencyKey);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.ordersService.listForUser(user.id, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.getForUser(user, id);
  }

  @Get(':id/tracking')
  tracking(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.getTracking(user, id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancel(user, id, dto);
  }
}
