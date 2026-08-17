import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { SetInventoryDto } from './dto/set-inventory.dto';
import { InventoryService } from './inventory.service';

const INVENTORY_ROLES = [Role.INVENTORY_MANAGER, Role.ADMIN, Role.SUPER_ADMIN];

@Roles(...INVENTORY_ROLES)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('variants/:variantId')
  listForVariant(@Param('variantId') variantId: string) {
    return this.inventoryService.listForVariant(variantId);
  }

  @Put('variants/:variantId/warehouses/:warehouseId')
  set(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId') variantId: string,
    @Param('warehouseId') warehouseId: string,
    @Body() dto: SetInventoryDto,
  ) {
    return this.inventoryService.set(variantId, warehouseId, dto, user.id);
  }
}
