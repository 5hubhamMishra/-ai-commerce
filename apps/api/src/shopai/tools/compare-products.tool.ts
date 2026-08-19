import { Injectable } from '@nestjs/common';
import { ComparisonService } from '../../comparison/comparison.service';
import { describeError } from './tool-error';
import type { ShopAITool, ShopAIToolResult } from './shopai-tool.interface';

const MAX_COMPARE = 4;

@Injectable()
export class CompareProductsTool implements ShopAITool {
  readonly name = 'compare_products';
  readonly description =
    'Compare 2-4 real products side by side by their product IDs (not slugs) — use search_products first to get IDs. Returns a real attribute-by-attribute matrix; never invent a comparison from memory.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      productIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          '2-4 product IDs to compare, from prior search_products results.',
      },
    },
    required: ['productIds'],
    additionalProperties: false,
  };

  constructor(private readonly comparison: ComparisonService) {}

  async execute(input: Record<string, unknown>): Promise<ShopAIToolResult> {
    const ids = input.productIds;
    if (!Array.isArray(ids) || ids.length < 2) {
      return {
        content: 'At least 2 product IDs are required to compare.',
        isError: true,
      };
    }
    if (ids.length > MAX_COMPARE) {
      return {
        content: `At most ${MAX_COMPARE} products can be compared at once.`,
        isError: true,
      };
    }
    try {
      const result = await this.comparison.compare(ids as string[]);
      const header = result.items.map((i) => i.name).join(' | ');
      const rows = result.attributeMatrix
        .flatMap((group) =>
          group.rows.map(
            (row) =>
              `${row.key}: ${row.values.map((v) => v ?? '—').join(' | ')}`,
          ),
        )
        .join('\n');
      const prices = result.items
        .map(
          (i) =>
            `${i.name}: ${i.minPrice}${i.maxPrice !== i.minPrice ? `–${i.maxPrice}` : ''}`,
        )
        .join('; ');
      return {
        content: `Comparing: ${header}\nPrices: ${prices}\n${rows}`,
        isError: false,
      };
    } catch (error) {
      return { content: describeError(error), isError: true };
    }
  }
}
