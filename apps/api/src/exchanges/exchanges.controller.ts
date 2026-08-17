import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { DispatchExchangeDto } from './dto/dispatch-exchange.dto';
import { ExchangesService } from './exchanges.service';

const FULFILLMENT_ROLES = [
  Role.INVENTORY_MANAGER,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];
const VIEW_ROLES = [Role.SUPPORT_AGENT, Role.ADMIN, Role.SUPER_ADMIN];

@Controller('exchanges')
export class ExchangesController {
  constructor(private readonly exchangesService: ExchangesService) {}

  @Roles(...FULFILLMENT_ROLES)
  @Patch('admin/:id/confirm-payment')
  confirmPaymentReceived(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.exchangesService.confirmPaymentReceived(user.id, id);
  }

  @Roles(...FULFILLMENT_ROLES)
  @Patch('admin/:id/dispatch')
  dispatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DispatchExchangeDto,
  ) {
    return this.exchangesService.dispatch(user.id, id, dto);
  }

  @Roles(...FULFILLMENT_ROLES)
  @Patch('admin/:id/delivered')
  markDelivered(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.exchangesService.markDelivered(user.id, id);
  }

  @Roles(...VIEW_ROLES)
  @Get('order/:orderId')
  listForOrder(@Param('orderId') orderId: string) {
    return this.exchangesService.listForOrder(orderId);
  }

  @Roles(...VIEW_ROLES)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.exchangesService.getById(id);
  }
}
