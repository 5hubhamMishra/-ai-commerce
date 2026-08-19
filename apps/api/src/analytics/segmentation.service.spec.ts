import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SegmentationService } from './segmentation.service';

async function buildService(
  profiles: { eventCount: number; orderCount: number }[],
) {
  const prisma = {
    customerProfile: { findMany: jest.fn().mockResolvedValue(profiles) },
  };
  const module = await Test.createTestingModule({
    providers: [
      SegmentationService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return module.get(SegmentationService);
}

describe('SegmentationService.getReport', () => {
  it('reports zero counts honestly when no profiles exist yet, rather than fabricating a distribution', async () => {
    const service = await buildService([]);
    const report = await service.getReport();
    expect(report.totalProfiles).toBe(0);
    expect(report.bySegment).toEqual([]);
    expect(report.byLifecycleStage).toEqual([]);
  });

  it('buckets profiles by the real segment/lifecycle heuristic and computes real shares', async () => {
    const service = await buildService([
      { eventCount: 0, orderCount: 0 }, // new / prospect
      { eventCount: 5, orderCount: 0 }, // browser / prospect
      { eventCount: 0, orderCount: 1 }, // buyer / first_time_customer
      { eventCount: 0, orderCount: 5 }, // repeat_buyer / repeat_customer
    ]);

    const report = await service.getReport();
    expect(report.totalProfiles).toBe(4);

    const newSegment = report.bySegment.find((s) => s.segment === 'new');
    expect(newSegment).toMatchObject({ count: 1, share: 0.25 });

    const prospects = report.byLifecycleStage.find(
      (s) => s.stage === 'prospect',
    );
    expect(prospects).toMatchObject({ count: 2, share: 0.5 });

    // Rows are sorted by count descending.
    expect(report.byLifecycleStage[0].count).toBeGreaterThanOrEqual(
      report.byLifecycleStage[report.byLifecycleStage.length - 1].count,
    );
  });
});
