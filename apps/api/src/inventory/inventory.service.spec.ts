import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: {
    productVariant: { findUnique: jest.Mock };
    warehouse: { findUnique: jest.Mock };
    inventory: { upsert: jest.Mock; findMany: jest.Mock };
  };
  let events: { inventoryChanged: jest.Mock };

  beforeEach(async () => {
    prisma = {
      productVariant: { findUnique: jest.fn() },
      warehouse: { findUnique: jest.fn() },
      inventory: { upsert: jest.fn(), findMany: jest.fn() },
    };
    events = { inventoryChanged: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: CatalogEventsService, useValue: events },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  it('throws not-found when the variant does not exist', async () => {
    prisma.productVariant.findUnique.mockResolvedValue(null);

    await expect(
      service.set('missing-variant', 'w1', { quantityOnHand: 10 }, 'actor1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.inventory.upsert).not.toHaveBeenCalled();
  });

  it('throws not-found when the warehouse does not exist', async () => {
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'v1',
      productId: 'p1',
      deletedAt: null,
    });
    prisma.warehouse.findUnique.mockResolvedValue(null);

    await expect(
      service.set('v1', 'missing-warehouse', { quantityOnHand: 10 }, 'actor1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('upserts the quantity counts and emits an inventory-changed event scoped to the product', async () => {
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'v1',
      productId: 'p1',
      deletedAt: null,
    });
    prisma.warehouse.findUnique.mockResolvedValue({ id: 'w1' });
    prisma.inventory.upsert.mockResolvedValue({
      id: 'inv1',
      variantId: 'v1',
      warehouseId: 'w1',
    });

    await service.set(
      'v1',
      'w1',
      { quantityOnHand: 25, reorderPoint: 5 },
      'actor1',
    );

    expect(prisma.inventory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          variantId_warehouseId: { variantId: 'v1', warehouseId: 'w1' },
        },
        create: expect.objectContaining({
          quantityOnHand: 25,
          reorderPoint: 5,
        }),
      }),
    );
    expect(events.inventoryChanged).toHaveBeenCalledWith(
      'inv1',
      'p1',
      'updated',
    );
  });

  describe('reservation lifecycle', () => {
    function fakeTx(rows: Record<string, unknown>[]) {
      return {
        $queryRaw: jest.fn().mockResolvedValue(rows),
        inventory: { update: jest.fn().mockResolvedValue({}) },
      };
    }

    it('reserves from the warehouse with the most availability', async () => {
      const tx = fakeTx([
        {
          id: 'inv-low',
          warehouseId: 'w-low',
          quantityOnHand: 10,
          quantityReserved: 8,
          quantityCommitted: 0,
        },
        {
          id: 'inv-high',
          warehouseId: 'w-high',
          quantityOnHand: 50,
          quantityReserved: 5,
          quantityCommitted: 0,
        },
      ]);

      const result = await service.reserveForOrder(tx as never, [
        { variantId: 'v1', quantity: 10 },
      ]);

      expect(result).toEqual([
        { variantId: 'v1', warehouseId: 'w-high', inventoryId: 'inv-high', quantity: 10 },
      ]);
      expect(tx.inventory.update).toHaveBeenCalledWith({
        where: { id: 'inv-high' },
        data: { quantityReserved: { increment: 10 } },
      });
    });

    it('throws INSUFFICIENT_INVENTORY when no single warehouse can cover the quantity', async () => {
      const tx = fakeTx([
        {
          id: 'inv1',
          warehouseId: 'w1',
          quantityOnHand: 5,
          quantityReserved: 0,
          quantityCommitted: 0,
        },
      ]);

      await expect(
        service.reserveForOrder(tx as never, [{ variantId: 'v1', quantity: 10 }]),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INSUFFICIENT_INVENTORY' }),
      });
      expect(tx.inventory.update).not.toHaveBeenCalled();
    });

    it('moves quantity from reserved to committed on commitReserved', async () => {
      const tx = fakeTx([]);
      await service.commitReserved(tx as never, [
        { variantId: 'v1', warehouseId: 'w1', quantity: 3 },
      ]);
      expect(tx.inventory.update).toHaveBeenCalledWith({
        where: { variantId_warehouseId: { variantId: 'v1', warehouseId: 'w1' } },
        data: {
          quantityReserved: { decrement: 3 },
          quantityCommitted: { increment: 3 },
        },
      });
    });

    it('decrements onHand and committed together on shipCommitted', async () => {
      const tx = fakeTx([]);
      await service.shipCommitted(tx as never, [
        { variantId: 'v1', warehouseId: 'w1', quantity: 2 },
      ]);
      expect(tx.inventory.update).toHaveBeenCalledWith({
        where: { variantId_warehouseId: { variantId: 'v1', warehouseId: 'w1' } },
        data: {
          quantityOnHand: { decrement: 2 },
          quantityCommitted: { decrement: 2 },
        },
      });
    });
  });
});
