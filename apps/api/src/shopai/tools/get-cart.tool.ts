import { Injectable } from '@nestjs/common';
import { CartService } from '../../cart/cart.service';
import { describeError } from './tool-error';
import {
  SHOPAI_REQUIRES_LOGIN_RESULT,
  type ShopAITool,
  type ShopAIToolContext,
  type ShopAIToolResult,
} from './shopai-tool.interface';

@Injectable()
export class GetCartTool implements ShopAITool {
  readonly name = 'get_cart';
  readonly description =
    "View the customer's own real cart contents. Only works for a logged-in customer — never describe cart contents you haven't actually fetched.";
  readonly inputSchema = {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  };

  constructor(private readonly cart: CartService) {}

  async execute(
    _input: Record<string, unknown>,
    context: ShopAIToolContext,
  ): Promise<ShopAIToolResult> {
    if (!context.authenticatedUser) return SHOPAI_REQUIRES_LOGIN_RESULT;
    try {
      const result = await this.cart.getCart(context.authenticatedUser.id);
      if (result.items.length === 0) {
        return { content: 'The cart is empty.', isError: false };
      }
      const lines = result.items.map(
        (item) =>
          `- ${item.quantity} x ${item.productName} (variant: ${item.variantId}) — ${item.currency} ${item.lineTotal}${
            item.isAvailable ? '' : ' (unavailable — flag this to the customer)'
          }`,
      );
      return {
        content: `${lines.join('\n')}\nSubtotal: ${result.currency} ${result.subtotal} (${result.itemCount} item(s))`,
        isError: false,
      };
    } catch (error) {
      return { content: describeError(error), isError: true };
    }
  }
}
