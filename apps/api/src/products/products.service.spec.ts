import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, ProductStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CacheService } from '../common/cache/cache.service';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: {
    product: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    category: { findUnique: jest.Mock };
    brand: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      category: { findUnique: jest.fn() },
      brand: { findUnique: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CacheService,
          useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn() },
        },
        {
          provide: CatalogEventsService,
          useValue: { productChanged: jest.fn() },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(ProductsService);
  });

  it('refuses to create a product under a category that does not exist', async () => {
    prisma.category.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        { name: 'Widget', description: 'x', categoryId: 'missing-cat' },
        'actor1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('refuses to create a product with a brand that does not exist', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'cat1',
      deletedAt: null,
    });
    prisma.brand.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        {
          name: 'Widget',
          description: 'x',
          categoryId: 'cat1',
          brandId: 'missing-brand',
        },
        'actor1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a slug already used by another product', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'cat1',
      deletedAt: null,
    });
    prisma.product.findUnique.mockResolvedValue({
      id: 'existing',
      deletedAt: null,
    });

    await expect(
      service.create(
        {
          name: 'Widget',
          slug: 'widget',
          description: 'x',
          categoryId: 'cat1',
        },
        'actor1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a concurrent product slug race to the duplicate conflict', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'cat1',
      deletedAt: null,
    });
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.product.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create(
        { name: 'Widget', slug: 'widget', categoryId: 'cat1' },
        'actor1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PRODUCT_SLUG_TAKEN' }),
    });
  });

  it('always scopes the public listing to ACTIVE status, ignoring any status filter', async () => {
    await service.listPublic({ status: ProductStatus.DRAFT });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: ProductStatus.ACTIVE }),
      }),
    );
  });
});
