import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { DispatchReplacementDto } from './dto/dispatch-replacement.dto';
import { ReplacementsService } from './replacements.service';

const FULFILLMENT_ROLES = [
  Role.INVENTORY_MANAGER,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];
const VIEW_ROLES = [Role.SUPPORT_AGENT, Role.ADMIN, Role.SUPER_ADMIN];

@Controller('replacements')
export class ReplacementsController {
  constructor(private readonly replacementsService: ReplacementsService) {}

  @Roles(...FULFILLMENT_ROLES)
  @Patch('admin/:id/dispatch')
  dispatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DispatchReplacementDto,
  ) {
    return this.replacementsService.dispatch(user.id, id, dto);
  }

  @Roles(...FULFILLMENT_ROLES)
  @Patch('admin/:id/delivered')
  markDelivered(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.replacementsService.markDelivered(user.id, id);
  }

  @Roles(...VIEW_ROLES)
  @Get('order/:orderId')
  listForOrder(@Param('orderId') orderId: string) {
    return this.replacementsService.listForOrder(orderId);
  }

  @Roles(...VIEW_ROLES)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.replacementsService.getById(id);
  }
}
