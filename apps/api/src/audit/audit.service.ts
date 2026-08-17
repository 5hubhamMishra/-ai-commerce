import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditEntry = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Records who changed what, when, for admin/seller-facing mutations (spec: AUDIT LOGGING).
 * Failures here must never break the calling operation — audit logging is best-effort
 * observability, not a transactional business requirement.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Intentionally swallowed: an audit-log write failure must not fail the user-facing
      // operation it's describing. A production build would also emit a metric here.
    }
  }
}
