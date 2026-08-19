import { Injectable } from '@nestjs/common';
import { ProductsService } from '../../products/products.service';
import {
  RecommendationsService,
  type ScoredProduct,
} from '../../recommendations/recommendations.service';
import { describeError } from './tool-error';
import type {
  ShopAITool,
  ShopAIToolContext,
  ShopAIToolResult,
} from './shopai-tool.interface';

const LIMIT = 5;
const RECOMMENDATION_TYPES = [
  'personalized',
  'similar',
  'frequently_bought_with',
] as const;

@Injectable()
export class GetRecommendationsTool implements ShopAITool {
  readonly name = 'get_recommendations';
  readonly description =
    'Get real, computed product recommendations — never invent suggestions from general knowledge. "personalized" uses the customer\'s own behavior (no productId needed). "similar" and "frequently_bought_with" need an anchor productId, usually from a prior search_products or get_product_details result.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: RECOMMENDATION_TYPES,
        description: 'Which kind of recommendation to fetch.',
      },
      productId: {
        type: 'string',
        description:
          'Required for "similar" and "frequently_bought_with" — the anchor product ID.',
      },
    },
    required: ['type'],
    additionalProperties: false,
  };

  constructor(
    private readonly recommendations: RecommendationsService,
    private readonly products: ProductsService,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: ShopAIToolContext,
  ): Promise<ShopAIToolResult> {
    const type = input.type;
    const productId =
      typeof input.productId === 'string' ? input.productId : undefined;
    const identity = {
      userId: context.userId,
      anonymousId: context.anonymousId,
    };

    try {
      let scored: ScoredProduct[];
      if (type === 'personalized') {
        scored = await this.recommendations.getPersonalized(identity, LIMIT);
      } else if (type === 'similar') {
        if (!productId) {
          return {
            content: 'A productId is required for "similar" recommendations.',
            isError: true,
          };
        }
        scored = await this.recommendations.getSimilar(
          identity,
          productId,
          LIMIT,
        );
      } else if (type === 'frequently_bought_with') {
        if (!productId) {
          return {
            content:
              'A productId is required for "frequently_bought_with" recommendations.',
            isError: true,
          };
        }
        scored = await this.recommendations.getFrequentlyBoughtWith(
          identity,
          productId,
          LIMIT,
        );
      } else {
        return {
          content: `Unknown recommendation type "${String(type)}".`,
          isError: true,
        };
      }

      if (scored.length === 0) {
        return {
          content:
            'No recommendations are available right now — say so honestly rather than inventing one.',
          isError: false,
        };
      }

      const summaries = await this.products.findSummariesByIds(
        scored.map((s) => s.productId),
      );
      const byId = new Map(summaries.map((s) => [s.id, s]));
      const lines = scored
        .map((s) => {
          const summary = byId.get(s.productId);
          if (!summary) return null;
          return `- ${summary.name} (slug: ${summary.slug}) — from ${summary.minPrice}${
            summary.maxPrice !== summary.minPrice ? `–${summary.maxPrice}` : ''
          } — ${s.reasons.join(', ')}`;
        })
        .filter((line): line is string => Boolean(line));

      return { content: lines.join('\n'), isError: false };
    } catch (error) {
      return { content: describeError(error), isError: true };
    }
  }
}
