import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

  it('soft-deletes and emits an event once the category is empty', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'c1', deletedAt: null });
    prisma.category.count.mockResolvedValue(0);
    prisma.product.count.mockResolvedValue(0);
    prisma.category.update.mockResolvedValue({ id: 'c1' });

    await service.remove('c1', 'actor1');

    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(events.categoryChanged).toHaveBeenCalledWith('c1', 'deleted');
  });
});
