import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const BCRYPT_ROUNDS = 12;
const REDACTED = '[deleted]';

type UserWithRoles = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  roles: { role: Role }[];
};

// Explicit allowlist, not `include: { roles: true }` on a bare query — a bare query
// returns every scalar column (passwordHash included) at runtime regardless of what a
// TypeScript return type claims, which would make leaking it just one missing
// `toPublic()` call away. `select` makes it structurally impossible to fetch, not just
// procedurally filtered after the fact.
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  createdAt: true,
  deletedAt: true,
  roles: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findById(id: string): Promise<UserWithRoles> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }
    return user;
  }

  async updateName(id: string, name: string): Promise<UserWithRoles> {
    return this.prisma.user.update({
      where: { id },
      data: { name },
      select: USER_SELECT,
    });
  }

  async list(params: { page: number; pageSize: number }) {
    const { page, pageSize } = params;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
    ]);
    return { items, total, page, pageSize };
  }

  toPublic(user: UserWithRoles) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      createdAt: user.createdAt,
      roles: user.roles.map((r) => r.role),
    };
  }

  /**
   * GDPR-style personal data export (spec PRIVACY: "data export"). Everything the app holds
   * that's about this user as a customer — not their behavior toward *other* users' data
   * (e.g. staff replies on a shared support ticket stay out, only their own messages come
   * back), and not their business records as a seller, which belong to that separate concern.
   */
  async exportData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        profile: true,
        addresses: true,
        roles: { select: { role: true } },
      },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    const [
      orders,
      cart,
      wishlist,
      activity,
      customerProfile,
      notifications,
      shopaiConversations,
      supportTickets,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        include: {
          items: true,
          stateHistory: true,
          payments: true,
          shipment: true,
          returnRequests: true,
          refunds: true,
          replacements: true,
          exchanges: true,
          invoice: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cart.findUnique({
        where: { userId },
        include: { items: true },
      }),
      this.prisma.wishlistItem.findMany({ where: { userId } }),
      this.prisma.behavioralEvent.findMany({
        where: { userId },
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.customerProfile.findUnique({ where: { userId } }),
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.shopAIConversation.findMany({
        where: { userId },
        include: { messages: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supportTicket.findMany({
        where: { userId },
        include: { messages: { where: { senderId: userId } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        roles: user.roles.map((r) => r.role),
      },
      profile: user.profile,
      addresses: user.addresses,
      orders,
      cart,
      wishlist,
      activity,
      customerProfile,
      notifications,
      shopaiConversations,
      supportTickets,
    };
  }

  /**
   * Account deletion (spec PRIVACY: "account deletion"). Anonymizes rather than hard-deletes:
   * `orders`/`payments`/`refunds`/support history are permanent financial/audit records
   * (`Order`'s own schema comment says as much) that a real FK graph — `Order.addressId`
   * included — depends on the `User`/`Address` rows continuing to exist. Everything that's
   * pure personal data with no retention requirement (cart, wishlist, notifications,
   * behavioral history, ShopAI conversation content) is deleted outright; everything an audit
   * trail needs to keep resolving (addresses, the account row itself) is scrubbed in place
   * instead. `password` re-verification guards against a hijacked access token being enough
   * on its own to destroy an account. See `DECISIONS.md` ADR-041 for the full reasoning.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_PASSWORD',
        message: 'Incorrect password.',
      });
    }

    const unusablePasswordHash = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      BCRYPT_ROUNDS,
    );

    await this.prisma.$transaction([
      this.prisma.behavioralEvent.deleteMany({ where: { userId } }),
      this.prisma.session.updateMany({
        where: { userId },
        data: { userId: null },
      }),
      this.prisma.customerProfile.deleteMany({ where: { userId } }),
      // Cascades to ShopAIMessage at the DB level (Cascade FK on the conversation).
      this.prisma.shopAIConversation.deleteMany({ where: { userId } }),
      // Operational telemetry, not conversation content — severed from the identity
      // rather than deleted outright, the same treatment its own onDelete: SetNull
      // already anticipates for a hard user-delete.
      this.prisma.shopAIInteractionLog.updateMany({
        where: { userId },
        data: { userId: null },
      }),
      this.prisma.recommendationImpression.updateMany({
        where: { userId },
        data: { userId: null },
      }),
      this.prisma.searchQueryLog.updateMany({
        where: { userId },
        data: { userId: null },
      }),
      // Cascades to CartItem at the DB level.
      this.prisma.cart.deleteMany({ where: { userId } }),
      this.prisma.wishlistItem.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      // Not deleted: SupportTicket.userId isn't nullable, and a ticket's thread needs to stay
      // structurally intact for the other party (support staff) who may have replied on it.
      // Same treatment as addresses — scrub the free text the user themselves wrote, keep the
      // row. Only the user's own messages (never staff replies) are touched.
      this.prisma.supportMessage.updateMany({
        where: { senderId: userId },
        data: { body: REDACTED },
      }),
      this.prisma.supportTicket.updateMany({
        where: { userId },
        data: { subject: REDACTED },
      }),
      // Not deleted: Order.addressId requires the row to keep existing. Scrubbed instead.
      this.prisma.address.updateMany({
        where: { userId },
        data: {
          label: null,
          line1: REDACTED,
          line2: null,
          city: REDACTED,
          state: REDACTED,
          postalCode: REDACTED,
          country: REDACTED,
        },
      }),
      this.prisma.profile.updateMany({
        where: { userId },
        data: {
          phone: null,
          dateOfBirth: null,
          notificationPreferences: {},
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@deleted.invalid`,
          name: 'Deleted User',
          passwordHash: unusablePasswordHash,
          isActive: false,
          deletedAt: new Date(),
        },
      }),
    ]);

    await this.audit.record({
      actorId: userId,
      action: 'USER_ACCOUNT_DELETED',
      entityType: 'user',
      entityId: userId,
    });
  }
}
