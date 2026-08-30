import { Injectable } from '@nestjs/common';
import { CartService } from '../../cart/cart.service';
import { describeError } from './tool-error';
import {
  SHOPAI_REQUIRES_LOGIN_RESULT,
  type ShopAITool,
  type ShopAIToolContext,
  type ShopAIToolResult,
} from './shopai-tool.interface';

const MAX_QUANTITY = 99;

@Injectable()
export class AddToCartTool implements ShopAITool {
  readonly name = 'add_to_cart';
  readonly description =
    "Add a specific product variant to the customer's own cart. The variantId must come from a real get_product_details result — never guess one. Only works for a logged-in customer. This changes real account state, so only call it when the customer has clearly asked to add something.";
  readonly inputSchema = {
    type: 'object',
    properties: {
      variantId: {
        type: 'string',
        description:
          'The product variant ID from a prior get_product_details result.',
      },
      quantity: {
        type: 'integer',
        minimum: 1,
        maximum: 99,
        description: 'How many units to add.',
      },
    },
    required: ['variantId', 'quantity'],
    additionalProperties: false,
  };

  constructor(private readonly cart: CartService) {}

  async execute(
    input: Record<string, unknown>,
    context: ShopAIToolContext,
  ): Promise<ShopAIToolResult> {
    if (!context.authenticatedUser) return SHOPAI_REQUIRES_LOGIN_RESULT;

    const variantId = input.variantId;
    const quantity = input.quantity;
    if (typeof variantId !== 'string' || !variantId) {
      return { content: 'A variantId is required.', isError: true };
    }
    if (
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY
    ) {
      return {
        content: `quantity must be an integer from 1 to ${MAX_QUANTITY}.`,
        isError: true,
      };
    }

    try {
      const result = await this.cart.addItem(context.authenticatedUser.id, {
        variantId,
        quantity,
      });
      const added = result.items.find((i) => i.variantId === variantId);
      return {
        content: `Added ${quantity} x ${added?.productName ?? 'item'} to the cart. New cart subtotal: ${result.currency} ${result.subtotal}.`,
        isError: false,
      };
    } catch (error) {
      return { content: describeError(error), isError: true };
    }
  }
}
