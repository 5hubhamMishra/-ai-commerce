import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { CacheService } from '../common/cache/cache.service';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: {
    category: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    product: { count: jest.Mock };
  };
  let events: { categoryChanged: jest.Mock };

  beforeEach(async () => {
    prisma = {
      category: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      product: { count: jest.fn() },
    };
    events = { categoryChanged: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CacheService,
          useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn() },
        },
        { provide: CatalogEventsService, useValue: events },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(CategoriesService);
  });

  it('slugifies the name when no slug is provided', async () => {
    prisma.category.findUnique.mockResolvedValue(null);
    prisma.category.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'c1', ...data }),
    );

    const result = await service.create(
      { name: 'Home Audio & Speakers' },
      'actor1',
    );

    expect(result.slug).toBe('home-audio-speakers');
    expect(events.categoryChanged).toHaveBeenCalledWith('c1', 'created');
  });

  it('rejects a slug that is already taken by another active category', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'existing',
      deletedAt: null,
    });

    await expect(
      service.create({ name: 'Laptops', slug: 'laptops' }, 'actor1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('maps a concurrent category slug race to the duplicate conflict', async () => {
    prisma.category.findUnique.mockResolvedValue(null);
    prisma.category.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create({ name: 'Laptops', slug: 'laptops' }, 'actor1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CATEGORY_SLUG_TAKEN' }),
    });
  });

  it('refuses to make a category its own parent', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'c1', deletedAt: null });

    await expect(
      service.update('c1', { parentId: 'c1' }, 'actor1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks deletion while child categories or products still reference it', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'c1', deletedAt: null });
    prisma.category.count.mockResolvedValue(0);
    prisma.product.count.mockResolvedValue(2);

    await expect(service.remove('c1', 'actor1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('rejects a stale category update', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    prisma.category.findUnique.mockResolvedValue({
      id: 'category-1',
      deletedAt: null,
      updatedAt,
    });
    prisma.category.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('category-1', { name: 'New name' }, 'actor1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CATEGORY_CHANGED' }),
    });
    expect(prisma.category.updateMany).toHaveBeenCalledWith({
      where: { id: 'category-1', updatedAt },
      data: {
        name: 'New name',
        slug: undefined,
        description: undefined,
        imageUrl: undefined,
        parentId: undefined,
        sortOrder: undefined,
        isActive: undefined,
      },
    });
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('soft-deletes and emits an event once the category is empty', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'c1', deletedAt: null });
    prisma.category.count.mockResolvedValue(0);
    prisma.product.count.mockResolvedValue(0);
    prisma.category.updateMany.mockResolvedValue({ count: 1 });

    await service.remove('c1', 'actor1');

    expect(prisma.category.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', updatedAt: undefined },
      data: { deletedAt: expect.any(Date) },
    });
    expect(events.categoryChanged).toHaveBeenCalledWith('c1', 'deleted');
  });

  it('rejects a stale category deletion', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    prisma.category.findUnique.mockResolvedValue({
      id: 'category-1',
      deletedAt: null,
      updatedAt,
    });
    prisma.category.count.mockResolvedValue(0);
    prisma.product.count.mockResolvedValue(0);
    prisma.category.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.remove('category-1', 'actor1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CATEGORY_CHANGED' }),
    });
    expect(prisma.category.updateMany).toHaveBeenCalledWith({
      where: { id: 'category-1', updatedAt },
      data: { deletedAt: expect.any(Date) },
    });
    expect(events.categoryChanged).not.toHaveBeenCalled();
  });
});
