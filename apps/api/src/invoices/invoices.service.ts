import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const NOT_YET_INVOICEABLE: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.CANCELLED,
];

const invoiceOrderInclude = {
  items: true,
  address: true,
  user: { select: { name: true, email: true } },
} as const;

/**
 * Invoice content is never duplicated storage — it's rendered from Order/
 * OrderItem/Address/User at request time, so it can never drift from the order
 * it describes. Only `invoiceNumber`/`issuedAt` are persisted (Invoice model),
 * anchoring a stable identity + numbering for an order that otherwise could be
 * "invoiced" freshly on every request with a different number each time.
 */
@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateForOwner(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: invoiceOrderInclude,
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }
    return this.render(order);
  }

  async getOrCreateForAdmin(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: invoiceOrderInclude,
    });
    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }
    return this.render(order);
  }

  private async render(
    order: NonNullable<
      Awaited<ReturnType<PrismaService['order']['findUnique']>>
    > & {
      items: {
        productName: string;
        sku: string;
        unitPrice: unknown;
        quantity: number;
        lineTotal: unknown;
        currency: string;
      }[];
      address: {
        line1: string;
        line2: string | null;
        city: string;
        state: string;
        postalCode: string;
        country: string;
      };
      user: { name: string; email: string };
    },
  ) {
    if (NOT_YET_INVOICEABLE.includes(order.status)) {
      throw new ConflictException({
        code: 'ORDER_NOT_INVOICEABLE',
        message: 'An invoice is only available once an order has been paid.',
      });
    }

    // Postgres' ON CONFLICT-backed upsert makes this atomic against concurrent
    // requests for the same order — orderId is unique, so a race just becomes
    // "insert, or update the row the other request just inserted."
    const invoice = await this.prisma.invoice.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id },
      update: {},
    });
    const invoiceNumber = `INV-${invoice.issuedAt.getFullYear()}-${String(invoice.sequenceNumber).padStart(6, '0')}`;

    return {
      invoiceNumber,
      issuedAt: invoice.issuedAt,
      order: {
        id: order.id,
        placedAt: order.createdAt,
        currency: order.currency,
      },
      billTo: {
        name: order.user.name,
        email: order.user.email,
        line1: order.address.line1,
        line2: order.address.line2,
        city: order.address.city,
        state: order.address.state,
        postalCode: order.address.postalCode,
        country: order.address.country,
      },
      items: order.items.map((item) => ({
        productName: item.productName,
        sku: item.sku,
        unitPrice: Number(item.unitPrice),
        quantity: item.quantity,
        lineTotal: Number(item.lineTotal),
      })),
      subtotal: Number(order.subtotal),
      shippingFee: Number(order.shippingFee),
      discountTotal: Number(order.discountTotal),
      taxTotal: Number(order.taxTotal),
      total: Number(order.total),
      currency: order.currency,
    };
  }
}
