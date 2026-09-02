import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { slugify } from '../common/utils/slugify';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from './products.service';

@Injectable()
export class ProductTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly events: CatalogEventsService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
  }

  async assign(productId: string, name: string, actorId: string) {
    await this.products.getRowById(productId);
    const slug = slugify(name);

    const tag = await this.prisma.tag.upsert({
      where: { slug },
      create: { name, slug },
      update: {},
    });

    const assignment = await this.prisma.productTagAssignment.upsert({
      where: { productId_tagId: { productId, tagId: tag.id } },
      create: { productId, tagId: tag.id },
      update: {},
    });

    await this.audit.record({
      actorId,
      action: 'PRODUCT_TAG_ASSIGNED',
      entityType: 'product_tag_assignment',
      entityId: `${assignment.productId}:${assignment.tagId}`,
      metadata: { productId, tagId: tag.id, name },
    });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  async remove(productId: string, tagId: string, actorId: string) {
    const deleted = await this.prisma.productTagAssignment.deleteMany({
      where: { productId, tagId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException({
        code: 'PRODUCT_TAG_NOT_FOUND',
        message: 'This tag is not assigned to the product.',
      });
    }
    await this.audit.record({
      actorId,
      action: 'PRODUCT_TAG_REMOVED',
      entityType: 'product_tag_assignment',
      entityId: `${productId}:${tagId}`,
      metadata: { productId, tagId },
    });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }
}
