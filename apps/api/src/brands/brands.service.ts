import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CACHE_PREFIX } from '../common/cache/cache-keys';
import { CacheService } from '../common/cache/cache.service';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { slugify } from '../common/utils/slugify';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import type { CreateBrandDto } from './dto/create-brand.dto';
import type { UpdateBrandDto } from './dto/update-brand.dto';

const LIST_CACHE_KEY = `${CACHE_PREFIX.BRANDS}active-list`;
const LIST_CACHE_TTL_SECONDS = 300;

@Injectable()
export class BrandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly events: CatalogEventsService,
    private readonly audit: AuditService,
  ) {}

  async findActiveList() {
    const cached = await this.cache.get(LIST_CACHE_KEY);
    if (cached) return cached;

    const brands = await this.prisma.brand.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });
    await this.cache.set(LIST_CACHE_KEY, brands, LIST_CACHE_TTL_SECONDS);
    return brands;
  }

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
      this.prisma.brand.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.brand.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findBySlug(slug: string, opts: { activeOnly: boolean }) {
    const brand = await this.prisma.brand.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...(opts.activeOnly ? { isActive: true } : {}),
      },
    });
    if (!brand) {
      throw new NotFoundException({
        code: 'BRAND_NOT_FOUND',
        message: 'Brand not found.',
      });
    }
    return brand;
  }

  async findById(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand || brand.deletedAt) {
      throw new NotFoundException({
        code: 'BRAND_NOT_FOUND',
        message: 'Brand not found.',
      });
    }
    return brand;
  }

  async create(dto: CreateBrandDto, actorId: string) {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    await this.assertSlugAvailable(slug);

    let brand: Awaited<ReturnType<typeof this.prisma.brand.create>>;
    try {
      brand = await this.prisma.brand.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          logoUrl: dto.logoUrl,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'BRAND_SLUG_TAKEN',
          message: 'A brand with this slug already exists.',
        });
      }
      throw error;
    }

    await this.audit.record({
      actorId,
      action: 'BRAND_CREATED',
      entityType: 'brand',
      entityId: brand.id,
      metadata: { name: brand.name, slug: brand.slug },
    });
    this.events.brandChanged(brand.id, 'created');
    return brand;
  }

  async update(id: string, dto: UpdateBrandDto, actorId: string) {
    const existing = await this.findById(id);
    const slug = dto.slug ? slugify(dto.slug) : undefined;
    if (slug) await this.assertSlugAvailable(slug, id);

    let brand: Awaited<ReturnType<typeof this.prisma.brand.findUniqueOrThrow>>;
    try {
      const claimed = await this.prisma.brand.updateMany({
        where: { id, updatedAt: existing.updatedAt },
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          logoUrl: dto.logoUrl,
          isActive: dto.isActive,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: 'BRAND_CHANGED',
          message: 'The brand changed before this update could be applied.',
        });
      }
      brand = await this.prisma.brand.findUniqueOrThrow({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'BRAND_SLUG_TAKEN',
          message: 'A brand with this slug already exists.',
        });
      }
      throw error;
    }

    await this.audit.record({
      actorId,
      action: 'BRAND_UPDATED',
      entityType: 'brand',
      entityId: brand.id,
      metadata: dto as Record<string, unknown>,
    });
    this.events.brandChanged(brand.id, 'updated');
    return brand;
  }

  async remove(id: string, actorId: string): Promise<void> {
    await this.findById(id);

    const productCount = await this.prisma.product.count({
      where: { brandId: id, deletedAt: null },
    });
    if (productCount > 0) {
      throw new ConflictException({
        code: 'BRAND_NOT_EMPTY',
        message:
          'This brand still has products assigned to it. Reassign or remove them first.',
      });
    }

    await this.prisma.brand.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      actorId,
      action: 'BRAND_DELETED',
      entityType: 'brand',
      entityId: id,
    });
    this.events.brandChanged(id, 'deleted');
  }

  private async assertSlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.brand.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId && !existing.deletedAt) {
      throw new ConflictException({
        code: 'BRAND_SLUG_TAKEN',
        message: 'A brand with this slug already exists.',
      });
    }
  }
}
