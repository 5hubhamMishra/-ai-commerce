import { Injectable } from '@nestjs/common';
import { SearchService } from '../../search/search.service';
import { describeError } from './tool-error';
import type {
  ShopAITool,
  ShopAIToolContext,
  ShopAIToolResult,
} from './shopai-tool.interface';

const RESULT_LIMIT = 8;

@Injectable()
export class SearchProductsTool implements ShopAITool {
  readonly name = 'search_products';
  readonly description =
    'Search the real product catalog by free-text query and optional filters. Always use this before describing any product — never invent one. Returns product name, slug, price range, and category for each match; use get_product_details for full detail on a specific product.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Free-text search, e.g. "wireless headphones under 5000". Can include a price constraint in plain language.',
      },
      category: {
        type: 'string',
        description: 'Exact category slug, if known.',
      },
      brand: { type: 'string', description: 'Exact brand slug, if known.' },
      minPrice: { type: 'number', description: 'Minimum price filter.' },
      maxPrice: { type: 'number', description: 'Maximum price filter.' },
    },
    required: [],
    additionalProperties: false,
  };

  constructor(private readonly search: SearchService) {}

  async execute(
    input: Record<string, unknown>,
    context: ShopAIToolContext,
  ): Promise<ShopAIToolResult> {
    try {
      const result = await this.search.search(
        {
          q: typeof input.query === 'string' ? input.query : undefined,
          category:
            typeof input.category === 'string' ? input.category : undefined,
          brand: typeof input.brand === 'string' ? input.brand : undefined,
          minPrice:
            typeof input.minPrice === 'number' ? input.minPrice : undefined,
          maxPrice:
            typeof input.maxPrice === 'number' ? input.maxPrice : undefined,
          pageSize: RESULT_LIMIT,
        },
        { userId: context.userId, anonymousId: context.anonymousId },
      );

      if (result.items.length === 0) {
        return {
          content: `No products found matching that search (${result.total} total matches). Tell the customer honestly that nothing matched, and suggest broadening the search — do not invent a product.`,
          isError: false,
        };
      }

      const lines = result.items.map(
        (item) =>
          `- ${item.name} (slug: ${item.slug}) — ${item.currency} ${item.minPrice}${
            item.maxPrice && item.maxPrice !== item.minPrice
              ? `–${item.maxPrice}`
              : ''
          }, category: ${item.category.name}${item.brand ? `, brand: ${item.brand.name}` : ''}, ${
            item.inStock ? 'in stock' : 'out of stock'
          }`,
      );
      return {
        content: `Found ${result.total} matching product(s), showing ${result.items.length}:\n${lines.join('\n')}`,
        isError: false,
      };
    } catch (error) {
      return { content: describeError(error), isError: true };
    }
  }
}
