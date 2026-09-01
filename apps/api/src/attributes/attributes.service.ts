import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import type { CreateAttributeDto } from './dto/create-attribute.dto';
import type { CreateAttributeValueDto } from './dto/create-attribute-value.dto';
import type { UpdateAttributeDto } from './dto/update-attribute.dto';

@Injectable()
export class AttributesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.attribute.findMany({
      include: { values: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const attribute = await this.prisma.attribute.findUnique({
      where: { id },
      include: { values: true },
    });
    if (!attribute) {
      throw new NotFoundException({
        code: 'ATTRIBUTE_NOT_FOUND',
        message: 'Attribute not found.',
      });
    }
    return attribute;
  }

  async create(dto: CreateAttributeDto) {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    await this.assertSlugAvailable(slug);
    try {
      return await this.prisma.attribute.create({
        data: { name: dto.name, slug },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'ATTRIBUTE_SLUG_TAKEN',
          message: 'An attribute with this slug already exists.',
        });
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateAttributeDto) {
    await this.findById(id);
    const slug = dto.slug ? slugify(dto.slug) : undefined;
    if (slug) await this.assertSlugAvailable(slug, id);
    try {
      return await this.prisma.attribute.update({
        where: { id },
        data: { name: dto.name, slug },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'ATTRIBUTE_SLUG_TAKEN',
          message: 'An attribute with this slug already exists.',
        });
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException({
          code: 'ATTRIBUTE_NOT_FOUND',
          message: 'Attribute not found.',
        });
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.prisma.attribute.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      throw new NotFoundException({
        code: 'ATTRIBUTE_NOT_FOUND',
        message: 'Attribute not found.',
      });
    }
  }

  async addValue(attributeId: string, dto: CreateAttributeValueDto) {
    await this.findById(attributeId);
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.value);
    const existing = await this.prisma.attributeValue.findUnique({
      where: { attributeId_slug: { attributeId, slug } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ATTRIBUTE_VALUE_ALREADY_EXISTS',
        message: 'This value already exists for the attribute.',
      });
    }
    try {
      return await this.prisma.attributeValue.create({
        data: { attributeId, value: dto.value, slug },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'ATTRIBUTE_VALUE_ALREADY_EXISTS',
          message: 'This value already exists for the attribute.',
        });
      }
      throw error;
    }
  }

  async removeValue(attributeId: string, valueId: string): Promise<void> {
    const deleted = await this.prisma.attributeValue.deleteMany({
      where: { id: valueId, attributeId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException({
        code: 'ATTRIBUTE_VALUE_NOT_FOUND',
        message: 'Attribute value not found.',
      });
    }
  }

  private async assertSlugAvailable(slug: string, excludeId?: string) {
    const existing = await this.prisma.attribute.findUnique({
      where: { slug },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException({
        code: 'ATTRIBUTE_SLUG_TAKEN',
        message: 'An attribute with this slug already exists.',
      });
    }
  }
}
