import { BadRequestException } from '@nestjs/common';
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
});
