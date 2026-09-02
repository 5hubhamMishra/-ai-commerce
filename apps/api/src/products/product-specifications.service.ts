import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
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
    private readonly audit: AuditService,
  ) {}

  async create(
    productId: string,
    dto: CreateSpecificationDto,
    actorId: string,
  ) {
    await this.products.getRowById(productId);
    const specification = await this.prisma.productSpecification.create({
      data: {
        productId,
        group: dto.group ?? 'General',
        key: dto.key,
        value: dto.value,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.record({
      actorId,
      action: 'PRODUCT_SPECIFICATION_CREATED',
      entityType: 'product_specification',
      entityId: specification.id,
      metadata: { productId },
    });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  async update(
    productId: string,
    specId: string,
    dto: UpdateSpecificationDto,
    actorId: string,
  ) {
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
    await this.audit.record({
      actorId,
      action: 'PRODUCT_SPECIFICATION_UPDATED',
      entityType: 'product_specification',
      entityId: specId,
      metadata: { productId, ...dto },
    });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }

  async remove(productId: string, specId: string, actorId: string) {
    const deleted = await this.prisma.productSpecification.deleteMany({
      where: { id: specId, productId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException({
        code: 'PRODUCT_SPECIFICATION_NOT_FOUND',
        message: 'Product specification not found.',
      });
    }
    await this.audit.record({
      actorId,
      action: 'PRODUCT_SPECIFICATION_DELETED',
      entityType: 'product_specification',
      entityId: specId,
      metadata: { productId },
    });
    this.events.productChanged(productId, 'updated');
    return this.products.findByIdAdmin(productId);
  }
}
