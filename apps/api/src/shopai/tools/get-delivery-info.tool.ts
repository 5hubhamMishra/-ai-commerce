import { Injectable } from '@nestjs/common';
import { OrdersService } from '../../orders/orders.service';
import { describeError } from './tool-error';
import {
  SHOPAI_REQUIRES_LOGIN_RESULT,
  type ShopAITool,
  type ShopAIToolContext,
  type ShopAIToolResult,
} from './shopai-tool.interface';

@Injectable()
export class GetDeliveryInfoTool implements ShopAITool {
  readonly name = 'get_delivery_info';
  readonly description =
    "Get real shipment/tracking status for one of the customer's own orders — carrier, tracking number, and the tracking event history. Only works for a logged-in customer looking up their own order.";
  readonly inputSchema = {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        description: 'The order ID to get delivery info for.',
      },
    },
    required: ['orderId'],
    additionalProperties: false,
  };

  constructor(private readonly orders: OrdersService) {}

  async execute(
    input: Record<string, unknown>,
    context: ShopAIToolContext,
  ): Promise<ShopAIToolResult> {
    if (!context.authenticatedUser) return SHOPAI_REQUIRES_LOGIN_RESULT;
    const orderId = input.orderId;
    if (typeof orderId !== 'string' || !orderId) {
      return { content: 'An orderId is required.', isError: true };
    }
    try {
      const tracking = await this.orders.getTracking(
        context.authenticatedUser,
        orderId,
      );
      if (!tracking.shipment) {
        return {
          content: `Order ${tracking.orderId} status: ${tracking.orderStatus}. No shipment has been dispatched yet.`,
          isError: false,
        };
      }
      const s = tracking.shipment;
      const events = s.events
        .map(
          (e) =>
            `${e.occurredAt.toISOString()}: ${e.status}${e.location ? ` at ${e.location}` : ''} — ${e.description}`,
        )
        .join('\n');
      return {
        content: `Order ${tracking.orderId} status: ${tracking.orderStatus}. Shipment via ${s.carrier ?? s.method}, tracking number ${s.trackingNumber ?? 'not yet assigned'}, current status ${s.status}.\nTracking history:\n${events || 'no events yet'}`,
        isError: false,
      };
    } catch (error) {
      return { content: describeError(error), isError: true };
    }
  }
}
