import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerProfileService } from './customer-profile.service';
import type { TrackEventsDto } from './dto/track-events.dto';
import { BehavioralQueueService } from './queue/behavioral-queue.service';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: BehavioralQueueService,
    private readonly customerProfiles: CustomerProfileService,
  ) {}

  /** `userId` is only ever a server-verified identity (from
   *  OptionalJwtAuthGuard's real Passport validation), never trusted from
   *  the request body — see events.controller.ts. */
  async track(userId: string | undefined, dto: TrackEventsDto) {
    await this.upsertSessions(userId, dto.events);

    const personalizationEnabled = await this.isPersonalizationEnabled(userId);

    const rows = dto.events.map((e) => ({
      id: e.eventId,
      eventType: e.eventType,
      userId: userId ?? null,
      anonymousId: e.anonymousId,
      sessionId: e.sessionId,
      source: e.source,
      entityId: e.entityId,
      metadata: (e.metadata ?? {}) as Prisma.InputJsonValue,
      schemaVersion: e.schemaVersion ?? 1,
      occurredAt: new Date(e.occurredAt),
    }));

    // skipDuplicates: a retry that reuses the same eventId is a safe no-op,
    // not an error — the client never has to know or care whether this was
    // the first attempt or the fifth (spec Verify: "duplicate prevention").
    await this.prisma.behavioralEvent.createMany({
      data: rows,
      skipDuplicates: true,
    });

    // Personalization opt-out (Profile.personalizationEnabled, real since
    // Phase 1) means the raw event still lands durably — the user's own
    // activity-history view still works — but it's never fed into the
    // aggregate profile driving personalization/recommendations.
    if (personalizationEnabled) {
      for (const row of rows) {
        await this.queue.enqueue({ eventId: row.id });
      }
    }

    return { accepted: rows.length };
  }

  async listActivity(userId: string, page: number, pageSize: number) {
    const [rows, total] = await Promise.all([
      this.prisma.behavioralEvent.findMany({
        where: { userId },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.behavioralEvent.count({ where: { userId } }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        entityId: r.entityId,
        source: r.source,
        occurredAt: r.occurredAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** The concrete, testable "privacy deletion behavior" PROMPT 07's own
   *  Verify: list names — erases both the raw event history and the
   *  aggregate profile derived from it, not just one or the other. */
  async eraseActivity(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.behavioralEvent.deleteMany({ where: { userId } }),
      this.prisma.customerProfile.deleteMany({ where: { userId } }),
    ]);
  }

  async getProfile(userId: string) {
    return this.customerProfiles.getForUser(userId);
  }

  private async upsertSessions(
    userId: string | undefined,
    events: TrackEventsDto['events'],
  ) {
    const bySessionId = new Map<
      string,
      { anonymousId: string; source: (typeof events)[number]['source'] }
    >();
    for (const e of events) {
      bySessionId.set(e.sessionId, {
        anonymousId: e.anonymousId,
        source: e.source,
      });
    }
    for (const [sessionId, info] of bySessionId) {
      await this.prisma.session.upsert({
        where: { id: sessionId },
        create: {
          id: sessionId,
          anonymousId: info.anonymousId,
          userId,
          source: info.source,
        },
        // Identity resolution: once a session is known to belong to a real
        // user, every subsequent touch keeps it linked — but a session
        // already linked to a user is never unlinked back to anonymous by a
        // later anonymous-looking call (e.g. a stale client retry).
        update: { lastSeenAt: new Date(), ...(userId ? { userId } : {}) },
      });
    }
  }

  private async isPersonalizationEnabled(
    userId: string | undefined,
  ): Promise<boolean> {
    if (!userId) return true; // no profile/opt-out concept for anonymous visitors yet
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    return profile?.personalizationEnabled ?? true;
  }
}
