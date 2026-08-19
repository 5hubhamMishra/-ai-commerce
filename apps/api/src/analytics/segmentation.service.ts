import { Injectable } from '@nestjs/common';
import {
  computeLifecycleStage,
  computeSegment,
} from '../events/customer-segment.util';
import { PrismaService } from '../prisma/prisma.service';

export type SegmentationReport = {
  totalProfiles: number;
  bySegment: { segment: string; count: number; share: number }[];
  byLifecycleStage: { stage: string; count: number; share: number }[];
};

/**
 * Customer segmentation and shopping-lifecycle reporting — PROMPT 11's own
 * "customer segmentation" / "shopping lifecycle" bullets. Not a separate
 * segmentation model: it is the exact same read-time-derived classification
 * CustomerProfileService has computed per-customer since Phase 6 (see
 * events/customer-segment.util.ts), counted in bulk across every known
 * profile instead of one at a time. If no profiles exist yet, this reports
 * zero counts honestly rather than fabricating a distribution.
 */
@Injectable()
export class SegmentationService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(): Promise<SegmentationReport> {
    const profiles = await this.prisma.customerProfile.findMany({
      select: { eventCount: true, orderCount: true },
    });

    const total = profiles.length;
    const segmentCounts = new Map<string, number>();
    const stageCounts = new Map<string, number>();
    for (const profile of profiles) {
      const segment = computeSegment(profile);
      const stage = computeLifecycleStage(profile);
      segmentCounts.set(segment, (segmentCounts.get(segment) ?? 0) + 1);
      stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
    }

    const toRows = (counts: Map<string, number>) =>
      [...counts.entries()]
        .map(([key, count]) => ({
          key,
          count,
          share: total > 0 ? count / total : 0,
        }))
        .sort((a, b) => b.count - a.count);

    return {
      totalProfiles: total,
      bySegment: toRows(segmentCounts).map(({ key, count, share }) => ({
        segment: key,
        count,
        share,
      })),
      byLifecycleStage: toRows(stageCounts).map(({ key, count, share }) => ({
        stage: key,
        count,
        share,
      })),
    };
  }
}
