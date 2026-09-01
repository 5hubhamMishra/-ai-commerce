import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Category } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CACHE_PREFIX } from '../common/cache/cache-keys';
import { CacheService } from '../common/cache/cache.service';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { slugify } from '../common/utils/slugify';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';

const TREE_CACHE_KEY = `${CACHE_PREFIX.CATEGORIES}tree`;
const TREE_CACHE_TTL_SECONDS = 300;

type CategoryNode = Category & { children: CategoryNode[] };

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly events: CatalogEventsService,
    private readonly audit: AuditService,
  ) {}

  /** Active, non-deleted categories as a nested tree — the public browse endpoint. */
  async findActiveTree(): Promise<CategoryNode[]> {
    const cached = await this.cache.get<CategoryNode[]>(TREE_CACHE_KEY);
    if (cached) return cached;

    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const tree = buildTree(categories);
    await this.cache.set(TREE_CACHE_KEY, tree, TREE_CACHE_TTL_SECONDS);
    return tree;
  }

  /** Flat, paginated listing for admin management — includes inactive unless filtered. */
  async adminList(params: {
    page: number;
    pageSize: number;
    includeInactive?: boolean;
  }) {
    const { page, pageSize, includeInactive } = params;
    const where = {
      deletedAt: null,
      ...(includeInactive ? {} : { isActive: true }),
    };
    const [items, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.category.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findBySlug(slug: string, opts: { activeOnly: boolean }) {
    const category = await this.prisma.category.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(opts.activeOnly ? { isActive: true } : {}),
      },
      include: {
        children: opts.activeOnly
          ? { where: { deletedAt: null, isActive: true } }
          : true,
      },
    });
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Category not found.',
      });
    }
    return category;
  }

  async findById(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category || category.deletedAt) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Category not found.',
      });
    }
    return category;
  }

  async create(dto: CreateCategoryDto, actorId: string) {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    await this.assertSlugAvailable(slug);
    if (dto.parentId) await this.findById(dto.parentId);

    let category: Category;
    try {
      category = await this.prisma.category.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          imageUrl: dto.imageUrl,
          parentId: dto.parentId,
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'CATEGORY_SLUG_TAKEN',
          message: 'A category with this slug already exists.',
        });
      }
      throw error;
    }

    await this.audit.record({
      actorId,
      action: 'CATEGORY_CREATED',
      entityType: 'category',
      entityId: category.id,
      metadata: { name: category.name, slug: category.slug },
    });
    this.events.categoryChanged(category.id, 'created');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, actorId: string) {
    const existing = await this.findById(id);
    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new ConflictException({
          code: 'CATEGORY_PARENT_CYCLE',
          message: 'A category cannot be its own parent.',
        });
      }
      await this.findById(dto.parentId);
    }
    const slug = dto.slug ? slugify(dto.slug) : undefined;
    if (slug) await this.assertSlugAvailable(slug, id);

    let category: Category;
    try {
      const claimed = await this.prisma.category.updateMany({
        where: { id, updatedAt: existing.updatedAt },
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          imageUrl: dto.imageUrl,
          parentId: dto.parentId,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: 'CATEGORY_CHANGED',
          message: 'The category changed before this update could be applied.',
        });
      }
      category = await this.prisma.category.findUniqueOrThrow({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'CATEGORY_SLUG_TAKEN',
          message: 'A category with this slug already exists.',
        });
      }
      throw error;
    }

    await this.audit.record({
      actorId,
      action: 'CATEGORY_UPDATED',
      entityType: 'category',
      entityId: category.id,
      metadata: dto as Record<string, unknown>,
    });
    this.events.categoryChanged(category.id, 'updated');
    return category;
  }

  async remove(id: string, actorId: string): Promise<void> {
    await this.findById(id);

    const [childCount, productCount] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id, deletedAt: null } }),
      this.prisma.product.count({ where: { categoryId: id, deletedAt: null } }),
    ]);
    if (childCount > 0 || productCount > 0) {
      throw new ConflictException({
        code: 'CATEGORY_NOT_EMPTY',
        message:
          'This category still has subcategories or products assigned to it. Reassign or remove them first.',
      });
    }

    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      actorId,
      action: 'CATEGORY_DELETED',
      entityType: 'category',
      entityId: id,
    });
    this.events.categoryChanged(id, 'deleted');
  }

  private async assertSlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId && !existing.deletedAt) {
      throw new ConflictException({
        code: 'CATEGORY_SLUG_TAKEN',
        message: 'A category with this slug already exists.',
      });
    }
  }
}

function buildTree(categories: Category[]): CategoryNode[] {
  const nodesById = new Map<string, CategoryNode>(
    categories.map((c) => [c.id, { ...c, children: [] }]),
  );
  const roots: CategoryNode[] = [];
  for (const node of nodesById.values()) {
    if (node.parentId && nodesById.has(node.parentId)) {
      nodesById.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
