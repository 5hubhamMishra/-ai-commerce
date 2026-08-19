import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ShopAIAnalyticsReport = {
  windowDays: number;
  totalInteractions: number;
  refusalRate: number;
  avgToolCallsPerInteraction: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  topTools: { name: string; count: number }[];
};

const DEFAULT_WINDOW_DAYS = 30;
const TOP_TOOLS_LIMIT = 20;

/** Logs every ShopAI turn and reports on the log — the spec's "AI
 *  observability" bullet. Same best-effort-write, never-break-the-request
 *  discipline as SearchAnalyticsService. */
@Injectable()
export class ShopAIAnalyticsService {
  private readonly logger = new Logger(ShopAIAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logInteraction(params: {
    conversationId: string;
    userId?: string;
    anonymousId?: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    toolCallCount: number;
    toolNames: string[];
    latencyMs: number;
    stopReason: string;
    refused: boolean;
  }): Promise<void> {
    try {
      await this.prisma.shopAIInteractionLog.create({
        data: {
          conversationId: params.conversationId,
          userId: params.userId,
          anonymousId: params.anonymousId,
          model: params.model,
          inputTokens: params.inputTokens,
          outputTokens: params.outputTokens,
          toolCallCount: params.toolCallCount,
          toolNames: params.toolNames,
          latencyMs: params.latencyMs,
          stopReason: params.stopReason,
          refused: params.refused,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to log ShopAI interaction: ${String(error)}`);
    }
  }

  async getReport(
    windowDays = DEFAULT_WINDOW_DAYS,
  ): Promise<ShopAIAnalyticsReport> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.shopAIInteractionLog.findMany({
      where: { createdAt: { gte: since } },
      select: {
        refused: true,
        toolCallCount: true,
        toolNames: true,
        latencyMs: true,
        inputTokens: true,
        outputTokens: true,
      },
    });

    const total = rows.length;
    const toolCounts = new Map<string, number>();
    let refusedCount = 0;
    let toolCallSum = 0;
    let latencySum = 0;
    let inputTokenSum = 0;
    let outputTokenSum = 0;
    for (const row of rows) {
      if (row.refused) refusedCount++;
      toolCallSum += row.toolCallCount;
      latencySum += row.latencyMs;
      inputTokenSum += row.inputTokens;
      outputTokenSum += row.outputTokens;
      for (const name of row.toolNames) {
        toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
      }
    }

    const topTools = [...toolCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_TOOLS_LIMIT)
      .map(([name, count]) => ({ name, count }));

    return {
      windowDays,
      totalInteractions: total,
      refusalRate: total > 0 ? refusedCount / total : 0,
      avgToolCallsPerInteraction: total > 0 ? toolCallSum / total : 0,
      avgLatencyMs: total > 0 ? latencySum / total : 0,
      totalInputTokens: inputTokenSum,
      totalOutputTokens: outputTokenSum,
      topTools,
    };
  }
}
