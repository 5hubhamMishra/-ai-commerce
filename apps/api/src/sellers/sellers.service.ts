import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
  ProductStatus,
  Role,
  SellerStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { slugify } from '../common/utils/slugify';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ListProductsQueryDto } from '../products/dto/list-products-query.dto';
import { ProductsService } from '../products/products.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import type { ApplySellerDto } from './dto/apply-seller.dto';
import type { ListSellersQueryDto } from './dto/list-sellers-query.dto';
import type { RejectSellerDto } from './dto/reject-seller.dto';
import type { SuspendSellerDto } from './dto/suspend-seller.dto';
import type { UpdateSellerDto } from './dto/update-seller.dto';
import {
  SELLER_VERIFICATION_PROVIDER,
  type SellerVerificationProvider,
} from './providers/seller-verification-provider.interface';

const NOT_A_SELLER = {
  code: 'NOT_A_SELLER',
  message: 'You do not operate a seller account.',
};

@Injectable()
export class SellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(SELLER_VERIFICATION_PROVIDER)
    private readonly verificationProvider: SellerVerificationProvider,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly warehouses: WarehousesService,
    private readonly products: ProductsService,
  ) {}

  // ---- Onboarding / own account -------------------------------------------

  async apply(userId: string, dto: ApplySellerDto) {
    this.assertMarketplaceEnabled();

    const existing = await this.prisma.seller.findUnique({
      where: { ownerUserId: userId },
    });
    if (existing) {
      throw new ConflictException({
        code: 'SELLER_ACCOUNT_EXISTS',
        message: 'You already operate a seller account.',
      });
    }

    const slug = await this.generateUniqueSlug(dto.businessName);
    const seller = await this.prisma.$transaction(async (tx) => {
      const created = await tx.seller.create({
        data: {
          ownerUserId: userId,
          businessName: dto.businessName,
          slug,
          description: dto.description,
          commissionRateBps: this.config.get<number>(
            'marketplace.defaultCommissionRateBps',
          )!,
        },
      });
      await tx.sellerStaff.create({
        data: { sellerId: created.id, userId, isOwner: true },
      });
      // Roles are re-read from the database on every request (ADR-007), so
      // this takes effect on the caller's very next request without them
      // needing to log in again — no separate "SELLER" grant step exists.
      await tx.userRole.upsert({
        where: { userId_role: { userId, role: Role.SELLER } },
        create: { userId, role: Role.SELLER },
        update: {},
      });
      return created;
    });

    const result = await this.verificationProvider.verify({
      sellerId: seller.id,
      businessName: seller.businessName,
    });
    const updated = await this.applyVerificationResult(seller.id, result);

    await this.audit.record({
      actorId: userId,
      action: 'SELLER_APPLIED',
      entityType: 'seller',
      entityId: seller.id,
      metadata: { businessName: seller.businessName, result: result.status },
    });

    return this.toOwnDetail(updated);
  }

  async getOwn(userId: string) {
    const seller = await this.getOwnedRow(userId);
    return this.toOwnDetail(seller);
  }

  async updateOwn(userId: string, dto: UpdateSellerDto) {
    const seller = await this.getOwnedRow(userId);
    const slug =
      dto.businessName && dto.businessName !== seller.businessName
        ? await this.generateUniqueSlug(dto.businessName, seller.id)
        : undefined;

    const updated = await this.prisma.seller.update({
      where: { id: seller.id },
      data: {
        businessName: dto.businessName,
        slug,
        description: dto.description,
        logoUrl: dto.logoUrl,
        bannerUrl: dto.bannerUrl,
      },
    });

    await this.audit.record({
      actorId: userId,
      action: 'SELLER_PROFILE_UPDATED',
      entityType: 'seller',
      entityId: seller.id,
      metadata: dto as Record<string, unknown>,
    });

    return this.toOwnDetail(updated);
  }

  // ---- Public storefront ----------------------------------------------------

  async getPublicBySlug(slug: string) {
    this.assertMarketplaceEnabled();
    const seller = await this.prisma.seller.findFirst({
      where: { slug, status: SellerStatus.VERIFIED },
    });
    if (!seller) {
      throw new NotFoundException({
        code: 'SELLER_NOT_FOUND',
        message: 'Seller not found.',
      });
    }
    const rating = await this.getRatingSummary(seller.id);
    return this.toPublicProfile(seller, rating);
  }

  async listPublicProducts(slug: string, query: ListProductsQueryDto) {
    this.assertMarketplaceEnabled();
    const seller = await this.prisma.seller.findFirst({
      where: { slug, status: SellerStatus.VERIFIED },
    });
    if (!seller) {
      throw new NotFoundException({
        code: 'SELLER_NOT_FOUND',
        message: 'Seller not found.',
      });
    }
    return this.products.listPublic(query, seller.id);
  }

  // ---- Admin ----------------------------------------------------------------
  // No state-machine guard on verify/reject/suspend/reinstate (unlike
  // Returns/Orders' assertTransition) — a seller account's status isn't a
  // safety-critical fulfillment pipeline, it's a moderation flag an admin can
  // reasonably move in either direction at any time (re-verify after a
  // rejection once the seller fixes something, re-suspend a reinstated
  // seller, etc.), same "deliberately permissive" reasoning SupportService
  // already uses for ticket status.

  async listAdmin(query: ListSellersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [rows, total] = await Promise.all([
      this.prisma.seller.findMany({
        where: query.status ? { status: query.status } : {},
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.seller.count({
        where: query.status ? { status: query.status } : {},
      }),
    ]);
    return { items: rows, total, page, pageSize };
  }

  async getAdminDetail(id: string) {
    const seller = await this.getRow(id);
    const rating = await this.getRatingSummary(id);
    return this.toPublicProfile(seller, rating);
  }

  /** Manual override — an admin can force VERIFIED regardless of what the
   *  verification provider previously returned (e.g. after a human review
   *  resolves a PENDING_MANUAL_REVIEW / REJECTED case). */
  async verify(actorId: string, id: string) {
    const seller = await this.getRow(id);
    const updated = await this.markVerified(id);
    await this.audit.record({
      actorId,
      action: 'SELLER_VERIFIED',
      entityType: 'seller',
      entityId: id,
    });
    await this.notifications.create(
      seller.ownerUserId,
      NotificationType.SYSTEM,
      'Seller account verified',
      'Your seller account has been verified. You can now list products.',
      'seller',
      id,
    );
    return this.toOwnDetail(updated);
  }

  async reject(actorId: string, id: string, dto: RejectSellerDto) {
    await this.getRow(id);
    const updated = await this.prisma.seller.update({
      where: { id },
      data: { status: SellerStatus.REJECTED, rejectReason: dto.reason },
    });
    await this.audit.record({
      actorId,
      action: 'SELLER_REJECTED',
      entityType: 'seller',
      entityId: id,
      metadata: { reason: dto.reason },
    });
    await this.notifications.create(
      updated.ownerUserId,
      NotificationType.SYSTEM,
      'Seller application rejected',
      `Your seller application was rejected: ${dto.reason}`,
      'seller',
      id,
    );
    return this.toOwnDetail(updated);
  }

  /** Also deactivates the seller's own listings (sets ACTIVE products to
   *  DRAFT) — a one-time write at the moment of suspension, not a continuous
   *  derived check on every product read, so existing catalog read paths
   *  need no changes at all. Reinstating does not auto-reactivate them; the
   *  seller must review and republish, same "don't auto-expose possibly
   *  stale listings" reasoning as any moderation reversal. */
  async suspend(actorId: string, id: string, dto: SuspendSellerDto) {
    const seller = await this.getRow(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.seller.update({
        where: { id },
        data: { status: SellerStatus.SUSPENDED, suspendReason: dto.reason },
      });
      await tx.product.updateMany({
        where: { sellerId: id, status: ProductStatus.ACTIVE },
        data: { status: ProductStatus.DRAFT },
      });
      return result;
    });
    await this.audit.record({
      actorId,
      action: 'SELLER_SUSPENDED',
      entityType: 'seller',
      entityId: id,
      metadata: { reason: dto.reason },
    });
    await this.notifications.create(
      seller.ownerUserId,
      NotificationType.SYSTEM,
      'Seller account suspended',
      `Your seller account has been suspended: ${dto.reason}`,
      'seller',
      id,
    );
    return this.toOwnDetail(updated);
  }

  async reinstate(actorId: string, id: string) {
    const seller = await this.getRow(id);
    if (seller.status !== SellerStatus.SUSPENDED) {
      throw new ConflictException({
        code: 'SELLER_NOT_SUSPENDED',
        message: 'Only a suspended seller can be reinstated.',
      });
    }
    const updated = await this.prisma.seller.update({
      where: { id },
      data: { status: SellerStatus.VERIFIED, suspendReason: null },
    });
    await this.audit.record({
      actorId,
      action: 'SELLER_REINSTATED',
      entityType: 'seller',
      entityId: id,
    });
    return this.toOwnDetail(updated);
  }

  // ---- Shared helpers used by other Phase 5 services -------------------------

  /** Resolves the caller's own seller id from their SellerStaff membership —
   *  RolesGuard only confirms they hold the SELLER/SELLER_STAFF role, not
   *  which seller account they belong to. */
  async resolveSellerIdForUser(userId: string): Promise<string> {
    const staff = await this.prisma.sellerStaff.findFirst({
      where: { userId },
      select: { sellerId: true },
    });
    if (!staff) throw new ForbiddenException(NOT_A_SELLER);
    return staff.sellerId;
  }

  async assertVerifiedSeller(sellerId: string) {
    const seller = await this.getRow(sellerId);
    if (seller.status !== SellerStatus.VERIFIED) {
      throw new ForbiddenException({
        code: 'SELLER_NOT_VERIFIED',
        message: 'Your seller account must be verified before you can do this.',
      });
    }
    return seller;
  }

  async getRatingSummary(sellerId: string) {
    const aggregate = await this.prisma.sellerRating.aggregate({
      where: { sellerId },
      _avg: { rating: true },
      _count: true,
    });
    return {
      average: aggregate._avg.rating ?? null,
      count: aggregate._count,
    };
  }

  assertMarketplaceEnabled() {
    if (!this.config.get<boolean>('marketplace.enabled')) {
      throw new ServiceUnavailableException({
        code: 'MARKETPLACE_DISABLED',
        message: 'Marketplace functionality is currently disabled.',
      });
    }
  }

  // ---- Private ----------------------------------------------------------------

  private async applyVerificationResult(
    sellerId: string,
    result: {
      status: 'VERIFIED' | 'REJECTED' | 'PENDING_MANUAL_REVIEW';
      reason?: string;
    },
  ) {
    if (result.status === 'VERIFIED') return this.markVerified(sellerId);
    if (result.status === 'REJECTED') {
      return this.prisma.seller.update({
        where: { id: sellerId },
        data: { status: SellerStatus.REJECTED, rejectReason: result.reason },
      });
    }
    // PENDING_MANUAL_REVIEW: stays PENDING_VERIFICATION, awaiting an admin.
    return this.getRow(sellerId);
  }

  /** Shared by both the automatic (apply -> verification provider) and
   *  manual (admin PATCH .../verify) paths to VERIFIED. Also provisions the
   *  seller's one default fulfillment warehouse the first time they become
   *  verified — idempotent (a re-verification after reinstatement reuses the
   *  existing one rather than creating a duplicate). The address fields are
   *  real-but-placeholder (spec doesn't ask this phase to collect a seller's
   *  actual fulfillment address at application time); a seller can correct
   *  them via PATCH /sellers/me/warehouse before shipping anything for real —
   *  documented as a known gap in DATABASE.md, not silently left broken. */
  private async markVerified(sellerId: string) {
    const seller = await this.prisma.seller.update({
      where: { id: sellerId },
      data: { status: SellerStatus.VERIFIED, verifiedAt: new Date() },
    });
    const existingWarehouse = await this.prisma.warehouse.findFirst({
      where: { sellerId },
    });
    if (!existingWarehouse) {
      await this.warehouses.create(
        {
          name: `${seller.businessName} Fulfillment`,
          code: `SELLER-${sellerId.slice(0, 8).toUpperCase()}`,
          line1: 'Not yet configured',
          city: 'Not yet configured',
          state: 'Not yet configured',
          postalCode: '000000',
          country: 'IN',
        },
        seller.ownerUserId,
        sellerId,
      );
    }
    return seller;
  }

  private async generateUniqueSlug(businessName: string, excludeId?: string) {
    const base = slugify(businessName);
    let candidate = base;
    let suffix = 1;
    // Bounded by the number of existing collisions, not an arbitrary retry
    // cap — same approach categories/brands already use for slug uniqueness.
    for (;;) {
      const existing = await this.prisma.seller.findUnique({
        where: { slug: candidate },
      });
      if (!existing || existing.id === excludeId) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
  }

  private async getOwnedRow(userId: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { ownerUserId: userId },
    });
    if (!seller) throw new ForbiddenException(NOT_A_SELLER);
    return seller;
  }

  private async getRow(id: string) {
    const seller = await this.prisma.seller.findUnique({ where: { id } });
    if (!seller) {
      throw new NotFoundException({
        code: 'SELLER_NOT_FOUND',
        message: 'Seller not found.',
      });
    }
    return seller;
  }

  private toOwnDetail(seller: Awaited<ReturnType<SellersService['getRow']>>) {
    return {
      id: seller.id,
      businessName: seller.businessName,
      slug: seller.slug,
      description: seller.description,
      logoUrl: seller.logoUrl,
      bannerUrl: seller.bannerUrl,
      status: seller.status,
      commissionRateBps: seller.commissionRateBps,
      rejectReason: seller.rejectReason,
      suspendReason: seller.suspendReason,
      verifiedAt: seller.verifiedAt,
      createdAt: seller.createdAt,
    };
  }

  private toPublicProfile(
    seller: Awaited<ReturnType<SellersService['getRow']>>,
    rating: { average: number | null; count: number },
  ) {
    return {
      id: seller.id,
      businessName: seller.businessName,
      slug: seller.slug,
      description: seller.description,
      logoUrl: seller.logoUrl,
      bannerUrl: seller.bannerUrl,
      status: seller.status,
      rating,
      createdAt: seller.createdAt,
    };
  }
}
