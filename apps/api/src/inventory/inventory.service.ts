import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SetInventoryDto } from './dto/set-inventory.dto';

type Tx = Prisma.TransactionClient;

export type ReservationResult = {
  variantId: string;
  warehouseId: string;
  inventoryId: string;
  quantity: number;
};

export type CommittedLine = {
  variantId: string;
  warehouseId: string;
  quantity: number;
};

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

  // ---- Reservation lifecycle (Phase 3: order creation / payment / cancellation) ---
  //
  // Buckets: quantityOnHand (physically in the warehouse) -> quantityReserved
  // (held during checkout, not yet paid) -> quantityCommitted (paid, guaranteed
  // sold, will physically leave on shipment). `available` = onHand - reserved -
  // committed (products.service.ts's availableQuantity()). Every method here is
  // meant to run inside the caller's own `prisma.$transaction`, alongside the
  // order/payment writes it's paired with — never on its own.

  /**
   * Locks each variant's inventory rows (`SELECT ... FOR UPDATE`) so concurrent
   * reservations for the same stock can't both see the same "available" number
   * and both succeed — the classic overselling race. Picks the single warehouse
   * with the most availability for each line; if none can cover the full
   * quantity, throws rather than splitting a line across warehouses.
   */
  async reserveForOrder(
    tx: Tx,
    items: { variantId: string; quantity: number }[],
  ): Promise<ReservationResult[]> {
    const results: ReservationResult[] = [];
    for (const item of items) {
      const rows = await tx.$queryRaw<
        {
          id: string;
          warehouseId: string;
          quantityOnHand: number;
          quantityReserved: number;
          quantityCommitted: number;
        }[]
      >`
        SELECT id, warehouse_id AS "warehouseId", quantity_on_hand AS "quantityOnHand",
               quantity_reserved AS "quantityReserved", quantity_committed AS "quantityCommitted"
        FROM inventory
        WHERE variant_id = ${item.variantId}
        ORDER BY warehouse_id
        FOR UPDATE
      `;

      const best = rows
        .map((row) => ({
          ...row,
          available:
            row.quantityOnHand - row.quantityReserved - row.quantityCommitted,
        }))
        .sort((a, b) => b.available - a.available)[0];

      if (!best || best.available < item.quantity) {
        throw new ConflictException({
          code: 'INSUFFICIENT_INVENTORY',
          message: 'One or more items no longer have enough stock available.',
          details: {
            variantId: item.variantId,
            requested: item.quantity,
            available: best?.available ?? 0,
          },
        });
      }

      await tx.inventory.update({
        where: { id: best.id },
        data: { quantityReserved: { increment: item.quantity } },
      });

      results.push({
        variantId: item.variantId,
        warehouseId: best.warehouseId,
        inventoryId: best.id,
        quantity: item.quantity,
      });
    }
    return results;
  }

  /** Payment succeeded: move stock from "held during checkout" to "confirmed sold". */
  async commitReserved(tx: Tx, lines: CommittedLine[]): Promise<void> {
    for (const line of lines) {
      await tx.inventory.update({
        where: {
          variantId_warehouseId: {
            variantId: line.variantId,
            warehouseId: line.warehouseId,
          },
        },
        data: {
          quantityReserved: { decrement: line.quantity },
          quantityCommitted: { increment: line.quantity },
        },
      });
    }
  }

  /** Order cancelled before payment: give back stock that was only ever reserved. */
  async releaseReserved(tx: Tx, lines: CommittedLine[]): Promise<void> {
    for (const line of lines) {
      await tx.inventory.update({
        where: {
          variantId_warehouseId: {
            variantId: line.variantId,
            warehouseId: line.warehouseId,
          },
        },
        data: { quantityReserved: { decrement: line.quantity } },
      });
    }
  }

  /** Order cancelled after payment (before shipment): give back committed stock. */
  async releaseCommitted(tx: Tx, lines: CommittedLine[]): Promise<void> {
    for (const line of lines) {
      await tx.inventory.update({
        where: {
          variantId_warehouseId: {
            variantId: line.variantId,
            warehouseId: line.warehouseId,
          },
        },
        data: { quantityCommitted: { decrement: line.quantity } },
      });
    }
  }

  /** Order shipped: committed stock physically leaves the warehouse. */
  async shipCommitted(tx: Tx, lines: CommittedLine[]): Promise<void> {
    for (const line of lines) {
      await tx.inventory.update({
        where: {
          variantId_warehouseId: {
            variantId: line.variantId,
            warehouseId: line.warehouseId,
          },
        },
        data: {
          quantityOnHand: { decrement: line.quantity },
          quantityCommitted: { decrement: line.quantity },
        },
      });
    }
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
