import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateWarehouseDto } from './dto/create-warehouse.dto';
import type { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
  }

  async findById(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException({
        code: 'WAREHOUSE_NOT_FOUND',
        message: 'Warehouse not found.',
      });
    }
    return warehouse;
  }

  // `sellerId` (Phase 5): undefined for the existing admin path (unchanged
  // behavior); set only by SellerCatalogService, for the one auto-provisioned
  // warehouse a verified seller gets — see DECISIONS.md ADR-020.
  async create(dto: CreateWarehouseDto, actorId: string, sellerId?: string) {
    await this.assertCodeAvailable(dto.code);
    let warehouse: Awaited<ReturnType<typeof this.prisma.warehouse.create>>;
    try {
      warehouse = await this.prisma.warehouse.create({
        data: { ...dto, sellerId, isActive: dto.isActive ?? true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'WAREHOUSE_CODE_TAKEN',
          message: 'A warehouse with this code already exists.',
        });
      }
      throw error;
    }
    await this.audit.record({
      actorId,
      action: 'WAREHOUSE_CREATED',
      entityType: 'warehouse',
      entityId: warehouse.id,
      metadata: { name: warehouse.name, code: warehouse.code },
    });
    return warehouse;
  }

  async update(id: string, dto: UpdateWarehouseDto, actorId: string) {
    await this.findById(id);
    if (dto.code) await this.assertCodeAvailable(dto.code, id);
    let warehouse: Awaited<ReturnType<typeof this.prisma.warehouse.update>>;
    try {
      warehouse = await this.prisma.warehouse.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'WAREHOUSE_CODE_TAKEN',
          message: 'A warehouse with this code already exists.',
        });
      }
      throw error;
    }
    await this.audit.record({
      actorId,
      action: 'WAREHOUSE_UPDATED',
      entityType: 'warehouse',
      entityId: id,
      metadata: dto as Record<string, unknown>,
    });
    return warehouse;
  }

  private async assertCodeAvailable(code: string, excludeId?: string) {
    const existing = await this.prisma.warehouse.findUnique({
      where: { code },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException({
        code: 'WAREHOUSE_CODE_TAKEN',
        message: 'A warehouse with this code already exists.',
      });
    }
  }
}
