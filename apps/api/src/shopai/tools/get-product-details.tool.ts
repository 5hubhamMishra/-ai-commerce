import { Injectable } from '@nestjs/common';
import { ProductsService } from '../../products/products.service';
import { describeError } from './tool-error';
import type { ShopAITool, ShopAIToolResult } from './shopai-tool.interface';

@Injectable()
export class GetProductDetailsTool implements ShopAITool {
  readonly name = 'get_product_details';
  readonly description =
    'Get full detail for one specific product by its slug — description, specifications, variants, pricing, and stock. Use search_products first to find the slug unless the customer already named an exact product you have the slug for.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description:
          'The product slug, usually from a prior search_products result.',
      },
    },
    required: ['slug'],
    additionalProperties: false,
  };

  constructor(private readonly products: ProductsService) {}

  async execute(input: Record<string, unknown>): Promise<ShopAIToolResult> {
    const slug = input.slug;
    if (typeof slug !== 'string' || !slug) {
      return { content: 'A product slug is required.', isError: true };
    }
    try {
      const product = await this.products.findBySlugPublic(slug);
      const specs = product.specifications
        .slice(0, 12)
        .map((s) => `${s.key}: ${s.value}`)
        .join('; ');
      const variantLines = product.variants
        .map(
          (v) =>
            `SKU ${v.sku} (variant id: ${v.id}) — ${product.currency} ${v.price}, ${
              v.availableQuantity > 0
                ? `${v.availableQuantity} in stock`
                : 'out of stock'
            }`,
        )
        .join('\n');
      return {
        content: [
          `${product.name} (${product.category.name}${product.brand ? `, ${product.brand.name}` : ''})`,
          product.description,
          specs ? `Specifications: ${specs}` : '',
          `Variants:\n${variantLines || 'none available'}`,
        ]
          .filter(Boolean)
          .join('\n'),
        isError: false,
      };
    } catch (error) {
      return { content: describeError(error), isError: true };
    }
  }
}
