import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SetInventoryDto } from './dto/set-inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: CatalogEventsService,
    private readonly audit: AuditService,
  ) {}

  async listForVariant(variantId: string) {
    await this.assertVariantExists(variantId);
    return this.prisma.inventory.findMany({
      where: { variantId },
      include: { warehouse: true },
      orderBy: { warehouse: { name: 'asc' } },
    });
  }

  async set(
    variantId: string,
    warehouseId: string,
    dto: SetInventoryDto,
    actorId: string,
  ) {
    const variant = await this.assertVariantExists(variantId);
    await this.assertWarehouseExists(warehouseId);

    const inventory = await this.prisma.inventory.upsert({
      where: { variantId_warehouseId: { variantId, warehouseId } },
      create: {
        variantId,
        warehouseId,
        quantityOnHand: dto.quantityOnHand ?? 0,
        quantityReserved: dto.quantityReserved ?? 0,
        quantityCommitted: dto.quantityCommitted ?? 0,
        quantityDamaged: dto.quantityDamaged ?? 0,
        quantityIncoming: dto.quantityIncoming ?? 0,
        reorderPoint: dto.reorderPoint ?? 0,
      },
      update: {
        quantityOnHand: dto.quantityOnHand,
        quantityReserved: dto.quantityReserved,
        quantityCommitted: dto.quantityCommitted,
        quantityDamaged: dto.quantityDamaged,
        quantityIncoming: dto.quantityIncoming,
        reorderPoint: dto.reorderPoint,
      },
      include: { warehouse: true },
    });

    await this.audit.record({
      actorId,
      action: 'INVENTORY_SET',
      entityType: 'inventory',
      entityId: inventory.id,
      metadata: { variantId, warehouseId, ...dto },
    });
    this.events.inventoryChanged(inventory.id, variant.productId, 'updated');
    return inventory;
  }

  private async assertVariantExists(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant || variant.deletedAt) {
      throw new NotFoundException({
        code: 'PRODUCT_VARIANT_NOT_FOUND',
        message: 'Product variant not found.',
      });
    }
    return variant;
  }

  private async assertWarehouseExists(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException({
        code: 'WAREHOUSE_NOT_FOUND',
        message: 'Warehouse not found.',
      });
    }
  }
}
