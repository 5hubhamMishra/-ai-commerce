import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { SellerCommerceService } from './seller-commerce.service';
import { SELLER_ROLES } from './sellers.controller';

const ADMIN_ROLES = [Role.ADMIN, Role.SUPER_ADMIN];

@Roles(...SELLER_ROLES)
@Controller('sellers/me')
export class SellerCommerceController {
  constructor(private readonly commerce: SellerCommerceService) {}

  @Get('orders')
  listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.commerce.listOrders(user.id, query);
  }

  @Get('orders/:orderId')
  getOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.commerce.getOrderDetail(user.id, orderId);
  }

  @Get('earnings')
  listEarnings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.commerce.listEarnings(user.id, query);
  }

  @Get('payouts')
  listPayouts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.commerce.listPayouts(user.id, query);
  }
}

@Roles(...ADMIN_ROLES)
@Controller('sellers/admin')
export class SellerCommerceAdminController {
  constructor(private readonly commerce: SellerCommerceService) {}

  @Post(':id/payouts')
  createPayout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.commerce.createPayout(user.id, id);
  }

  @Get(':id/payouts')
  listPayouts(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.commerce.listPayoutsForSellerAdmin(id, query);
  }
}
