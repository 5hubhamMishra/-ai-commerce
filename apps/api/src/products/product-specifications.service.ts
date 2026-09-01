import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogEventsService } from '../common/events/catalog-events.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSpecificationDto } from './dto/create-specification.dto';
import type { UpdateSpecificationDto } from './dto/update-specification.dto';
import { ProductsService } from './products.service';

@Injectable()
export class ProductSpecificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly events: CatalogEventsService,
  ) {}

  async create(productId: string, dto: CreateSpecificationDto) {
    await this.products.getRowById(productId);
    await this.prisma.productSpecification.create({
      data: {
        productId,
        group: dto.group ?? 'General',
        key: dto.key,
        value: dto.value,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  async update(productId: string, specId: string, dto: UpdateSpecificationDto) {
    const updated = await this.prisma.productSpecification.updateMany({
      where: { id: specId, productId },
      data: dto,
    });
    if (updated.count === 0) {
      throw new NotFoundException({
        code: 'PRODUCT_SPECIFICATION_NOT_FOUND',
        message: 'Product specification not found.',
      });
    }
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  async remove(productId: string, specId: string) {
    const deleted = await this.prisma.productSpecification.deleteMany({
      where: { id: specId, productId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException({
        code: 'PRODUCT_SPECIFICATION_NOT_FOUND',
        message: 'Product specification not found.',
      });
    }
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }
}
