import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SellerCatalogService } from './seller-catalog.service';

describe('SellerCatalogService inventory', () => {
  it('rejects seller writes to order-controlled inventory buckets', async () => {
    const inventorySet = jest.fn();
    const service = new SellerCatalogService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { set: inventorySet } as never,
      {} as never,
    );

    await expect(
      service.setInventory('seller-user-1', 'variant-1', {
        quantityOnHand: 10,
        quantityReserved: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(inventorySet).not.toHaveBeenCalled();
  });

  it('blocks product updates for sellers who are not verified', async () => {
    const productUpdate = jest.fn();
    const service = new SellerCatalogService(
      {} as never,
      {
        resolveSellerIdForUser: jest.fn().mockResolvedValue('seller-1'),
        assertVerifiedSeller: jest
          .fn()
          .mockRejectedValue(new ForbiddenException('not verified')),
      } as never,
      { update: productUpdate } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.update('seller-user-1', 'product-1', {
        status: 'ACTIVE' as never,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(productUpdate).not.toHaveBeenCalled();
  });
});
