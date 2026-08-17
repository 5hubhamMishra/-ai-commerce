import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReplacementStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import type { DispatchReplacementDto } from './dto/dispatch-replacement.dto';

type Tx = Prisma.TransactionClient;

// A simple 3-step linear chain — unlike Returns/Orders it doesn't branch, so a
// small in-file map is proportionate rather than a dedicated state-machine file.
const TRANSITIONS: Record<ReplacementStatus, ReplacementStatus[]> = {
  REQUESTED: [ReplacementStatus.APPROVED, ReplacementStatus.CANCELLED],
  APPROVED: [ReplacementStatus.SHIPPED, ReplacementStatus.CANCELLED],
  SHIPPED: [ReplacementStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
};

function assertTransition(from: ReplacementStatus, to: ReplacementStatus) {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new ConflictException({
      code: 'INVALID_REPLACEMENT_TRANSITION',
      message: `Cannot transition a replacement from ${from} to ${to}.`,
    });
  }
}

@Injectable()
export class ReplacementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly audit: AuditService,
  ) {}

  /** Called by ReturnsService.complete() inside its own transaction. Starts at
   *  APPROVED, not REQUESTED — the decision was already made by completing the
   *  return with resolution = REPLACEMENT; there's no separate approval step. */
  async createReplacementRecordTx(
    tx: Tx,
    params: {
      returnRequestId: string;
      orderId: string;
      items: { variantId: string; quantity: number }[];
    },
    actorId: string,
  ) {
    const replacement = await tx.replacement.create({
      data: {
        returnRequestId: params.returnRequestId,
        orderId: params.orderId,
        status: ReplacementStatus.APPROVED,
        items: { create: params.items },
      },
    });
    await this.ordersService.markReplacement(tx, params.orderId, actorId);
    return replacement;
  }

  async dispatch(
    actorId: string,
    replacementId: string,
    dto: DispatchReplacementDto,
  ) {
    const replacement = await this.getRow(replacementId);
    assertTransition(replacement.status, ReplacementStatus.SHIPPED);

    const updated = await this.prisma.replacement.update({
      where: { id: replacementId },
      data: {
        status: ReplacementStatus.SHIPPED,
        carrier: dto.carrier,
        trackingNumber: dto.trackingNumber,
      },
    });
    await this.audit.record({
      actorId,
      action: 'REPLACEMENT_DISPATCHED',
      entityType: 'replacement',
      entityId: replacementId,
      metadata: { carrier: dto.carrier, trackingNumber: dto.trackingNumber },
    });
    return toReplacementView(updated);
  }

  async markDelivered(actorId: string, replacementId: string) {
    const replacement = await this.getRow(replacementId);
    assertTransition(replacement.status, ReplacementStatus.DELIVERED);

    const updated = await this.prisma.replacement.update({
      where: { id: replacementId },
      data: { status: ReplacementStatus.DELIVERED },
    });
    await this.audit.record({
      actorId,
      action: 'REPLACEMENT_DELIVERED',
      entityType: 'replacement',
      entityId: replacementId,
    });
    return toReplacementView(updated);
  }

  async listForOrder(orderId: string) {
    const rows = await this.prisma.replacement.findMany({
      where: { orderId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toReplacementView);
  }

  async getById(replacementId: string) {
    return toReplacementView(await this.getRow(replacementId));
  }

  private async getRow(replacementId: string) {
    const replacement = await this.prisma.replacement.findUnique({
      where: { id: replacementId },
      include: { items: true },
    });
    if (!replacement) {
      throw new NotFoundException({
        code: 'REPLACEMENT_NOT_FOUND',
        message: 'Replacement not found.',
      });
    }
    return replacement;
  }
}

function toReplacementView(replacement: {
  id: string;
  returnRequestId: string;
  orderId: string;
  status: ReplacementStatus;
  carrier: string | null;
  trackingNumber: string | null;
  createdAt: Date;
  items?: { variantId: string; quantity: number }[];
}) {
  return {
    id: replacement.id,
    returnRequestId: replacement.returnRequestId,
    orderId: replacement.orderId,
    status: replacement.status,
    carrier: replacement.carrier,
    trackingNumber: replacement.trackingNumber,
    createdAt: replacement.createdAt,
    items: replacement.items?.map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
    })),
  };
}
