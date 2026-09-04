import { ProductStatus } from '@prisma/client';
import { CartService } from './cart.service';

describe('CartService', () => {
  it('atomically creates or increments a cart line', async () => {
    const prisma = {
      productVariant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'v1',
          deletedAt: null,
          isActive: true,
          product: {
            id: 'p1',
            deletedAt: null,
            status: ProductStatus.ACTIVE,
          },
        }),
      },
      cart: { upsert: jest.fn().mockResolvedValue({ id: 'cart1' }) },
      cartItem: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new CartService(prisma as never);

    await service.addItem('u1', { variantId: 'v1', quantity: 2 });

    expect(prisma.cartItem.upsert).toHaveBeenCalledWith({
      where: { cartId_variantId: { cartId: 'cart1', variantId: 'v1' } },
      create: { cartId: 'cart1', variantId: 'v1', quantity: 2 },
      update: { quantity: { increment: 2 } },
    });
  });

  it('rejects an add that would exceed the cart line limit', async () => {
    const upsert = jest.fn();
    const prisma = {
      productVariant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'v1',
          deletedAt: null,
          isActive: true,
          product: { deletedAt: null, status: ProductStatus.ACTIVE },
        }),
      },
      cart: { upsert: jest.fn().mockResolvedValue({ id: 'cart1' }) },
      cartItem: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 998 }),
        upsert,
      },
    };
    const service = new CartService(prisma as never);

    await expect(
      service.addItem('u1', { variantId: 'v1', quantity: 2 }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CART_QUANTITY_LIMIT' }),
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects a stale cart quantity update', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      cart: { upsert: jest.fn().mockResolvedValue({ id: 'cart1' }) },
      cartItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'item1',
          cartId: 'cart1',
          updatedAt,
        }),
        updateMany,
      },
    };
    const service = new CartService(prisma as never);

    await expect(
      service.updateItem('u1', 'item1', { quantity: 3 }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CART_ITEM_CHANGED' }),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'item1', cartId: 'cart1', updatedAt },
      data: { quantity: 3 },
    });
  });

  it('rejects a stale cart item removal', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      cart: { upsert: jest.fn().mockResolvedValue({ id: 'cart1' }) },
      cartItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'item1',
          cartId: 'cart1',
          updatedAt,
        }),
        deleteMany,
      },
    };
    const service = new CartService(prisma as never);

    await expect(service.removeItem('u1', 'item1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CART_ITEM_CHANGED' }),
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'item1', cartId: 'cart1', updatedAt },
    });
  });
});
