import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductVariantsService } from './product-variants.service';
import { ProductsService } from './products.service';

describe('ProductVariantsService', () => {
  let service: ProductVariantsService;
  let prisma: {
    productVariant: {
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    variantAttributeValue: { deleteMany: jest.Mock; createMany: jest.Mock };
    attributeValue: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let products: { getRowById: jest.Mock; findByIdAdmin: jest.Mock };

  beforeEach(async () => {
    prisma = {
      productVariant: {
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      variantAttributeValue: { deleteMany: jest.fn(), createMany: jest.fn() },
      attributeValue: { count: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    products = {
      getRowById: jest.fn().mockResolvedValue({ id: 'p1' }),
      findByIdAdmin: jest.fn().mockResolvedValue({ id: 'p1', variants: [] }),
    };

    const module = await Test.createTestingModule({
      providers: [
        ProductVariantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProductsService, useValue: products },
        {
          provide: CatalogEventsService,
          useValue: { productChanged: jest.fn() },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(ProductVariantsService);
  });

  it('makes the first variant of a product the default automatically', async () => {
    prisma.productVariant.findUnique.mockResolvedValue(null); // sku available
    prisma.productVariant.count.mockResolvedValue(0);
    prisma.productVariant.create.mockResolvedValue({ id: 'v1' });

    await service.create('p1', { sku: 'SKU-1', price: 100 }, 'actor1');

    expect(prisma.productVariant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDefault: true }),
      }),
    );
  });

  it('does not default a second variant unless explicitly requested', async () => {
    prisma.productVariant.findUnique.mockResolvedValue(null);
    prisma.productVariant.count.mockResolvedValue(1);
    prisma.productVariant.create.mockResolvedValue({ id: 'v2' });

    await service.create('p1', { sku: 'SKU-2', price: 100 }, 'actor1');

    expect(prisma.productVariant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDefault: false }),
      }),
    );
    expect(prisma.productVariant.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a SKU that already exists on another variant', async () => {
    prisma.productVariant.findUnique.mockResolvedValue({ id: 'other-variant' });

    await expect(
      service.create('p1', { sku: 'DUPLICATE', price: 100 }, 'actor1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.productVariant.create).not.toHaveBeenCalled();
  });

  it('maps a concurrent SKU race to the duplicate conflict', async () => {
    prisma.productVariant.findUnique.mockResolvedValue(null);
    prisma.productVariant.count.mockResolvedValue(0);
    prisma.productVariant.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create('p1', { sku: 'RACE-SKU', price: 100 }, 'actor1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SKU_ALREADY_EXISTS' }),
    });
  });

  it('throws not-found when updating a variant that belongs to a different product', async () => {
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'v1',
      productId: 'other-product',
    });

    await expect(
      service.update('p1', 'v1', { price: 200 }, 'actor1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('unsets the previous default when a variant is updated to become the default', async () => {
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'v2',
      productId: 'p1',
      sku: 'SKU-2',
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    await service.update('p1', 'v2', { isDefault: true }, 'actor1');

    expect(prisma.productVariant.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'v2',
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      data: {
        sku: undefined,
        price: undefined,
        compareAtPrice: undefined,
        currency: undefined,
        weightGrams: undefined,
        isDefault: false,
        isActive: undefined,
      },
    });
    expect(prisma.productVariant.updateMany).toHaveBeenCalledWith({
      where: { productId: 'p1', isDefault: true, NOT: { id: 'v2' } },
      data: { isDefault: false },
    });
    expect(prisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'v2' },
      data: { isDefault: true },
    });
  });

  it('maps a concurrent default-variant race separately from an SKU conflict', async () => {
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'v2',
      productId: 'p1',
      sku: 'SKU-2',
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    prisma.productVariant.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['product_id'] },
      }),
    );

    await expect(
      service.update('p1', 'v2', { isDefault: true }, 'actor1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DEFAULT_VARIANT_CHANGED' }),
    });
  });

  it('rejects a stale variant deletion', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'v1',
      productId: 'p1',
      deletedAt: null,
      updatedAt,
    });
    prisma.productVariant.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.remove('p1', 'v1', 'actor1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRODUCT_VARIANT_CHANGED' }),
    });
    expect(prisma.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', updatedAt },
      data: {
        deletedAt: expect.any(Date),
        isActive: false,
        isDefault: false,
      },
    });
    expect(prisma.productVariant.update).not.toHaveBeenCalled();
  });

  it('rejects a stale variant update before changing defaults', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'v1',
      productId: 'p1',
      sku: 'SKU-1',
      updatedAt,
    });
    prisma.productVariant.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('p1', 'v1', { price: 200, isDefault: true }, 'actor1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRODUCT_VARIANT_CHANGED' }),
    });
    expect(prisma.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', updatedAt },
      data: {
        sku: undefined,
        price: 200,
        compareAtPrice: undefined,
        currency: undefined,
        weightGrams: undefined,
        isDefault: false,
        isActive: undefined,
      },
    });
    expect(prisma.variantAttributeValue.deleteMany).not.toHaveBeenCalled();
  });
});
