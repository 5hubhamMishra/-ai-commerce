import { Injectable, NotFoundException } from '@nestjs/common';
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
  ) {}

  async list() {
    return this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
  }

  async assign(productId: string, name: string) {
    await this.products.getRowById(productId);
    const slug = slugify(name);

    const tag = await this.prisma.tag.upsert({
      where: { slug },
      create: { name, slug },
      update: {},
    });

    await this.prisma.productTagAssignment.upsert({
      where: { productId_tagId: { productId, tagId: tag.id } },
      create: { productId, tagId: tag.id },
      update: {},
    });

    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  async remove(productId: string, tagId: string) {
    const assignment = await this.prisma.productTagAssignment.findUnique({
      where: { productId_tagId: { productId, tagId } },
    });
    if (!assignment) {
      throw new NotFoundException({
        code: 'PRODUCT_TAG_NOT_FOUND',
        message: 'This tag is not assigned to the product.',
      });
    }
    await this.prisma.productTagAssignment.delete({
      where: { productId_tagId: { productId, tagId } },
    });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }
}
