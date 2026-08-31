import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Role, TicketStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTicketDto } from './dto/create-ticket.dto';
import type { ReplyTicketDto } from './dto/reply-ticket.dto';
import type { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

const STAFF_ROLES: Role[] = [Role.SUPPORT_AGENT, Role.ADMIN, Role.SUPER_ADMIN];

// Deliberately permissive/simple (unlike returns/orders, a support ticket's
// lifecycle isn't safety-critical — reopening a resolved ticket is normal,
// everyday support behavior, not an edge case to guard against).
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.CLOSED],
  IN_PROGRESS: [TicketStatus.RESOLVED, TicketStatus.CLOSED, TicketStatus.OPEN],
  RESOLVED: [TicketStatus.CLOSED, TicketStatus.OPEN],
  CLOSED: [TicketStatus.OPEN],
};

function assertTransition(from: TicketStatus, to: TicketStatus) {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new ConflictException({
      code: 'INVALID_TICKET_TRANSITION',
      message: `Cannot transition a ticket from ${from} to ${to}.`,
    });
  }
}

const ticketDetailInclude = {
  messages: { orderBy: { createdAt: 'asc' as const } },
} as const;

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateTicketDto) {
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
      });
      if (!order || order.userId !== user.id) {
        throw new NotFoundException({
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found.',
        });
      }
    }

    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId: user.id,
        orderId: dto.orderId,
        subject: dto.subject,
        category: dto.category,
        messages: {
          create: { senderId: user.id, isStaffReply: false, body: dto.message },
        },
      },
      include: ticketDetailInclude,
    });

    await this.audit.record({
      actorId: user.id,
      action: 'SUPPORT_TICKET_CREATED',
      entityType: 'support_ticket',
      entityId: ticket.id,
      metadata: { category: dto.category, orderId: dto.orderId },
    });

    return toTicketDetail(ticket);
  }

  async reply(user: AuthenticatedUser, ticketId: string, dto: ReplyTicketDto) {
    const ticket = await this.getRow(ticketId);
    const isStaff = user.roles.some((role) => STAFF_ROLES.includes(role));
    if (!isStaff && ticket.userId !== user.id) {
      throw new NotFoundException({
        code: 'TICKET_NOT_FOUND',
        message: 'Support ticket not found.',
      });
    }

    await this.prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: user.id,
        isStaffReply: isStaff,
        body: dto.body,
      },
    });
    // A staff reply on an OPEN ticket implicitly starts work on it; a customer
    // reply doesn't change status either way (avoids surprising status churn
    // from ordinary back-and-forth conversation).
    if (isStaff && ticket.status === TicketStatus.OPEN) {
      await this.prisma.supportTicket.updateMany({
        where: { id: ticketId, status: TicketStatus.OPEN },
        data: { status: TicketStatus.IN_PROGRESS },
      });
    }

    await this.audit.record({
      actorId: user.id,
      action: 'SUPPORT_MESSAGE_SENT',
      entityType: 'support_ticket',
      entityId: ticketId,
      metadata: { isStaffReply: isStaff },
    });
    if (isStaff) {
      await this.notifications.create(
        ticket.userId,
        NotificationType.SUPPORT,
        'New reply on your support ticket',
        `"${ticket.subject}" has a new reply.`,
        'support_ticket',
        ticketId,
      );
    }

    return this.getAdminDetail(ticketId);
  }

  async updateStatus(
    actorId: string,
    ticketId: string,
    dto: UpdateTicketStatusDto,
  ) {
    const ticket = await this.getRow(ticketId);
    assertTransition(ticket.status, dto.status);

    const claimed = await this.prisma.supportTicket.updateMany({
      where: { id: ticketId, status: ticket.status },
      data: { status: dto.status },
    });
    if (claimed.count === 0) {
      throw new ConflictException({
        code: 'TICKET_STATUS_CHANGED',
        message: 'The ticket changed before this update could be applied.',
      });
    }
    const updated = await this.getRow(ticketId);
    await this.audit.record({
      actorId,
      action: 'SUPPORT_TICKET_STATUS_UPDATED',
      entityType: 'support_ticket',
      entityId: ticketId,
      metadata: { fromStatus: ticket.status, toStatus: dto.status },
    });
    await this.notifications.create(
      ticket.userId,
      NotificationType.SUPPORT,
      'Support ticket status updated',
      `"${ticket.subject}" is now ${dto.status.toLowerCase().replace('_', ' ')}.`,
      'support_ticket',
      ticketId,
    );

    return toTicketDetail(updated);
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toTicketSummary);
  }

  async listAdmin(status?: TicketStatus) {
    const rows = await this.prisma.supportTicket.findMany({
      where: status ? { status } : {},
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toTicketSummary);
  }

  async getForUser(user: AuthenticatedUser, ticketId: string) {
    const ticket = await this.getRow(ticketId);
    if (ticket.userId !== user.id) {
      throw new NotFoundException({
        code: 'TICKET_NOT_FOUND',
        message: 'Support ticket not found.',
      });
    }
    return toTicketDetail(ticket);
  }

  async getAdminDetail(ticketId: string) {
    return toTicketDetail(await this.getRow(ticketId));
  }

  private async getRow(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: ticketDetailInclude,
    });
    if (!ticket) {
      throw new NotFoundException({
        code: 'TICKET_NOT_FOUND',
        message: 'Support ticket not found.',
      });
    }
    return ticket;
  }
}

function toTicketSummary(ticket: {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  orderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    orderId: ticket.orderId,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

function toTicketDetail(ticket: {
  id: string;
  userId: string;
  subject: string;
  category: string;
  status: TicketStatus;
  orderId: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages: {
    id: string;
    senderId: string;
    isStaffReply: boolean;
    body: string;
    createdAt: Date;
  }[];
}) {
  return {
    ...toTicketSummary(ticket),
    userId: ticket.userId,
    messages: ticket.messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      isStaffReply: m.isStaffReply,
      body: m.body,
      createdAt: m.createdAt,
    })),
  };
}
