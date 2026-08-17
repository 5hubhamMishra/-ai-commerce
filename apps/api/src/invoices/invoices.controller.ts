import { Controller, Get, Param } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { InvoicesService } from './invoices.service';

const INVOICE_ADMIN_ROLES = [Role.SUPPORT_AGENT, Role.ADMIN, Role.SUPER_ADMIN];

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get('order/:orderId')
  getOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.invoicesService.getOrCreateForOwner(user.id, orderId);
  }

  @Roles(...INVOICE_ADMIN_ROLES)
  @Get('admin/order/:orderId')
  getAdmin(@Param('orderId') orderId: string) {
    return this.invoicesService.getOrCreateForAdmin(orderId);
  }
}
