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
});
