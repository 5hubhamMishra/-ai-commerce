import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateRefundDto } from './dto/create-refund.dto';
import { RefundsService } from './refunds.service';

const REFUND_ADMIN_ROLES = [Role.ADMIN, Role.SUPER_ADMIN];
const REFUND_VIEW_ROLES = [Role.SUPPORT_AGENT, Role.ADMIN, Role.SUPER_ADMIN];

@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Roles(...REFUND_ADMIN_ROLES)
  @Post('admin')
  createStandalone(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRefundDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.refundsService.createStandalone(user.id, dto, idempotencyKey);
  }

  @Roles(...REFUND_VIEW_ROLES)
  @Get('order/:orderId')
  listForOrder(@Param('orderId') orderId: string) {
    return this.refundsService.listForOrder(orderId);
  }

  @Roles(...REFUND_VIEW_ROLES)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.refundsService.getById(id);
  }
}
