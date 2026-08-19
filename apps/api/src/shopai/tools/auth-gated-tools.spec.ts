import { AddToCartTool } from './add-to-cart.tool';
import { GetCartTool } from './get-cart.tool';
import { GetDeliveryInfoTool } from './get-delivery-info.tool';
import { GetOrderInfoTool } from './get-order-info.tool';
import type { ShopAIToolContext } from './shopai-tool.interface';

/** These four tools touch account-scoped data (cart, orders, delivery) and
 *  must never execute the underlying service call for a caller with no
 *  real, JWT-verified `authenticatedUser` — the "authorization" step of the
 *  tool-calling pipeline enforced in code, not just prompted. An
 *  `anonymousId` alone (even a real one) must never satisfy this check. */
describe('ShopAI tools require a real authenticated user', () => {
  const anonymousContext: ShopAIToolContext = { anonymousId: 'anon-123' };

  it('get_cart refuses an anonymous caller without touching CartService', async () => {
    const cartService = { getCart: jest.fn(), addItem: jest.fn() };
    const tool = new GetCartTool(cartService as never);

    const result = await tool.execute({}, anonymousContext);

    expect(result.isError).toBe(true);
    expect(cartService.getCart).not.toHaveBeenCalled();
  });

  it('add_to_cart refuses an anonymous caller without touching CartService', async () => {
    const cartService = { getCart: jest.fn(), addItem: jest.fn() };
    const tool = new AddToCartTool(cartService as never);

    const result = await tool.execute(
      { variantId: 'v1', quantity: 1 },
      anonymousContext,
    );

    expect(result.isError).toBe(true);
    expect(cartService.addItem).not.toHaveBeenCalled();
  });

  it('get_order_info refuses an anonymous caller without touching OrdersService', async () => {
    const ordersService = {
      getForUser: jest.fn(),
      listForUser: jest.fn(),
      getTracking: jest.fn(),
    };
    const tool = new GetOrderInfoTool(ordersService as never);

    const result = await tool.execute({}, anonymousContext);

    expect(result.isError).toBe(true);
    expect(ordersService.getForUser).not.toHaveBeenCalled();
    expect(ordersService.listForUser).not.toHaveBeenCalled();
  });

  it('get_delivery_info refuses an anonymous caller without touching OrdersService', async () => {
    const ordersService = {
      getForUser: jest.fn(),
      listForUser: jest.fn(),
      getTracking: jest.fn(),
    };
    const tool = new GetDeliveryInfoTool(ordersService as never);

    const result = await tool.execute({ orderId: 'order-1' }, anonymousContext);

    expect(result.isError).toBe(true);
    expect(ordersService.getTracking).not.toHaveBeenCalled();
  });
});

describe('add_to_cart input validation', () => {
  const authedContext: ShopAIToolContext = {
    authenticatedUser: { id: 'user-1', email: 'a@b.com', roles: [] },
  };

  it('rejects a non-positive quantity without calling CartService', async () => {
    const cartService = { getCart: jest.fn(), addItem: jest.fn() };
    const tool = new AddToCartTool(cartService as never);

    const result = await tool.execute(
      { variantId: 'v1', quantity: 0 },
      authedContext,
    );

    expect(result.isError).toBe(true);
    expect(cartService.addItem).not.toHaveBeenCalled();
  });

  it('rejects a missing variantId without calling CartService', async () => {
    const cartService = { getCart: jest.fn(), addItem: jest.fn() };
    const tool = new AddToCartTool(cartService as never);

    const result = await tool.execute({ quantity: 1 }, authedContext);

    expect(result.isError).toBe(true);
    expect(cartService.addItem).not.toHaveBeenCalled();
  });

  it('calls CartService.addItem for a valid, authenticated request', async () => {
    const cartService = {
      getCart: jest.fn(),
      addItem: jest.fn().mockResolvedValue({
        items: [{ variantId: 'v1', productName: 'Widget' }],
        currency: 'INR',
        subtotal: 500,
      }),
    };
    const tool = new AddToCartTool(cartService as never);

    const result = await tool.execute(
      { variantId: 'v1', quantity: 2 },
      authedContext,
    );

    expect(cartService.addItem).toHaveBeenCalledWith('user-1', {
      variantId: 'v1',
      quantity: 2,
    });
    expect(result.isError).toBe(false);
    expect(result.content).toContain('Widget');
  });
});
