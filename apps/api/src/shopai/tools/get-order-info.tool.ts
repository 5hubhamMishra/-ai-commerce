import { Injectable } from '@nestjs/common';
import { OrdersService } from '../../orders/orders.service';
import { describeError } from './tool-error';
import {
  SHOPAI_REQUIRES_LOGIN_RESULT,
  type ShopAITool,
  type ShopAIToolContext,
  type ShopAIToolResult,
} from './shopai-tool.interface';

const RECENT_ORDERS_LIMIT = 5;

@Injectable()
export class GetOrderInfoTool implements ShopAITool {
  readonly name = 'get_order_info';
  readonly description =
    "Look up the customer's own real order(s). Pass orderId for one specific order's full detail, or omit it to list their recent orders. Only works for a logged-in customer, and only ever returns that customer's own orders — never another customer's.";
  readonly inputSchema = {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        description:
          "A specific order ID. Omit to list the customer's recent orders instead.",
      },
    },
    required: [],
    additionalProperties: false,
  };

  constructor(private readonly orders: OrdersService) {}

  async execute(
    input: Record<string, unknown>,
    context: ShopAIToolContext,
  ): Promise<ShopAIToolResult> {
    if (!context.authenticatedUser) return SHOPAI_REQUIRES_LOGIN_RESULT;
    const orderId =
      typeof input.orderId === 'string' ? input.orderId : undefined;

    try {
      if (orderId) {
        const order = await this.orders.getForUser(
          context.authenticatedUser,
          orderId,
        );
        const items = order.items
          .map(
            (i) =>
              `${i.quantity} x ${i.productName} (${i.currency} ${i.lineTotal})`,
          )
          .join('; ');
        return {
          content: `Order ${order.id}: status ${order.status}, total ${order.currency} ${order.total}, placed ${order.createdAt.toISOString()}. Items: ${items}.`,
          isError: false,
        };
      }

      const list = await this.orders.listForUser(context.authenticatedUser.id, {
        page: 1,
        pageSize: RECENT_ORDERS_LIMIT,
      });
      if (list.items.length === 0) {
        return { content: 'This customer has no orders yet.', isError: false };
      }
      const lines = list.items.map(
        (o) =>
          `- Order ${o.id}: status ${o.status}, ${o.itemCount} item(s), ${o.currency} ${o.total}, placed ${o.createdAt.toISOString()}`,
      );
      return {
        content: `${list.total} total order(s), showing ${list.items.length} most recent:\n${lines.join('\n')}`,
        isError: false,
      };
    } catch (error) {
      return { content: describeError(error), isError: true };
    }
  }
}
