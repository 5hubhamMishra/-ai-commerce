import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { OrderStatus, PayoutStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { PaginationQueryDto } from './dto/pagination-query.dto';
import {
  SELLER_PAYOUT_PROVIDER,
  type PayoutResult,
  type SellerPayoutProvider,
} from './providers/seller-payout-provider.interface';
import { SellersService } from './sellers.service';

@Injectable()
export class SellerCommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellers: SellersService,
    @Inject(SELLER_PAYOUT_PROVIDER)
    private readonly payoutProvider: SellerPayoutProvider,
    private readonly audit: AuditService,
  ) {}

  // ---- Orders (own) ---------------------------------------------------------

  async listOrders(userId: string, query: PaginationQueryDto) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [rows, total] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: { sellerId },
        include: {
          order: { select: { id: true, status: true, createdAt: true } },
        },
        orderBy: { order: { createdAt: 'desc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.orderItem.count({ where: { sellerId } }),
    ]);
    return {
      items: rows.map((item) => this.toOrderItemView(item)),
      total,
      page,
      pageSize,
    };
  }

  /** Only this seller's own line items within the order — never the full
   *  order, another seller's items, or payment/address details a seller
   *  has no legitimate reason to see. */
  async getOrderDetail(userId: string, orderId: string) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    const rows = await this.prisma.orderItem.findMany({
      where: { sellerId, orderId },
      include: {
        order: { select: { id: true, status: true, createdAt: true } },
      },
    });
    if (rows.length === 0) {
      return { orderId, items: [] };
    }
    return {
      orderId,
      orderStatus: rows[0].order.status,
      items: rows.map((item) => this.toOrderItemView(item)),
    };
  }

  // ---- Earnings (own) ---------------------------------------------------------

  async listEarnings(userId: string, query: PaginationQueryDto) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    return this.listEarningsForSeller(sellerId, query);
  }

  private async listEarningsForSeller(
    sellerId: string,
    query: PaginationQueryDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [rows, total] = await Promise.all([
      this.prisma.sellerEarning.findMany({
        where: { sellerId },
        include: {
          orderItem: {
            select: {
              productName: true,
              sku: true,
              order: { select: { id: true, status: true } },
            },
          },
          payout: { select: { status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sellerEarning.count({ where: { sellerId } }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        orderId: row.orderItem.order.id,
        productName: row.orderItem.productName,
        sku: row.orderItem.sku,
        grossAmount: Number(row.grossAmount),
        commissionAmount: Number(row.commissionAmount),
        netAmount: Number(row.netAmount),
        currency: row.currency,
        // Derived, not stored — see schema.prisma's SellerEarning doc comment.
        status: row.payout
          ? row.payout.status === PayoutStatus.PAID
            ? 'PAID'
            : 'PENDING'
          : row.orderItem.order.status === OrderStatus.DELIVERED
            ? 'AVAILABLE'
            : 'PENDING',
        createdAt: row.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  // ---- Payouts (own read, admin trigger) ---------------------------------------

  async listPayouts(userId: string, query: PaginationQueryDto) {
    const sellerId = await this.sellers.resolveSellerIdForUser(userId);
    return this.listPayoutsForSeller(sellerId, query);
  }

  async listPayoutsForSellerAdmin(sellerId: string, query: PaginationQueryDto) {
    return this.listPayoutsForSeller(sellerId, query);
  }

  private async listPayoutsForSeller(
    sellerId: string,
    query: PaginationQueryDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [rows, total] = await Promise.all([
      this.prisma.sellerPayout.findMany({
        where: { sellerId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sellerPayout.count({ where: { sellerId } }),
    ]);
    return { items: rows, total, page, pageSize };
  }

  /** Sums eligible earnings in one currency (the first eligible currency),
   *  calls the payout provider once for that batch, and links every covered
   *  earning to the resulting SellerPayout. Earnings are claimed before the
   *  provider call so concurrent payout requests cannot pay the same batch
   *  twice. Other currencies remain eligible for a later payout. */
  async createPayout(actorId: string, sellerId: string) {
    const claim = await this.prisma.$transaction(async (tx) => {
      const eligible = await tx.sellerEarning.findMany({
        where: {
          sellerId,
          payoutId: null,
          orderItem: { order: { status: OrderStatus.DELIVERED } },
        },
      });
      if (eligible.length === 0) {
        throw new ConflictException({
          code: 'NO_ELIGIBLE_EARNINGS',
          message: 'This seller has no delivered, unpaid earnings to pay out.',
        });
      }
      const currency = eligible[0].currency;
      const batch = eligible.filter((e) => e.currency === currency);
      const amount = batch.reduce((sum, e) => sum + Number(e.netAmount), 0);
      const created = await tx.sellerPayout.create({
        data: {
          sellerId,
          amount,
          currency,
          status: PayoutStatus.PROCESSING,
        },
      });
      const claimed = await tx.sellerEarning.updateMany({
        where: { id: { in: batch.map((e) => e.id) }, payoutId: null },
        data: { payoutId: created.id },
      });
      if (claimed.count !== batch.length) {
        throw new ConflictException({
          code: 'PAYOUT_ALREADY_IN_PROGRESS',
          message: 'Another payout already claimed these earnings.',
        });
      }
      return { payout: created, amount, currency };
    });

    let result: PayoutResult;
    try {
      result = await this.payoutProvider.payout({
        sellerId,
        amount: claim.amount,
        currency: claim.currency,
        idempotencyKey: `seller-payout-${claim.payout.id}`,
      });
    } catch (error) {
      result = {
        success: false,
        raw: {},
        failureReason:
          error instanceof Error
            ? error.message
            : 'Payout provider request failed.',
      };
    }

    const payout = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.sellerPayout.update({
        where: { id: claim.payout.id },
        data: {
          status: result.success ? PayoutStatus.PAID : PayoutStatus.FAILED,
          providerRef: result.providerRef,
          failureReason: result.failureReason,
        },
      });
      if (!result.success) {
        await tx.sellerEarning.updateMany({
          where: { payoutId: claim.payout.id },
          data: { payoutId: null },
        });
      }
      return updated;
    });

    await this.audit.record({
      actorId,
      action: 'SELLER_PAYOUT_CREATED',
      entityType: 'seller_payout',
      entityId: payout.id,
      metadata: {
        sellerId,
        amount: claim.amount,
        currency: claim.currency,
        success: result.success,
      },
    });

    return payout;
  }

  private toOrderItemView(item: {
    id: string;
    orderId: string;
    productName: string;
    sku: string;
    unitPrice: unknown;
    quantity: number;
    lineTotal: unknown;
    currency: string;
    order: { id: string; status: OrderStatus; createdAt: Date };
  }) {
    return {
      id: item.id,
      orderId: item.orderId,
      orderStatus: item.order.status,
      orderCreatedAt: item.order.createdAt,
      productName: item.productName,
      sku: item.sku,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
      lineTotal: Number(item.lineTotal),
      currency: item.currency,
    };
  }
}
