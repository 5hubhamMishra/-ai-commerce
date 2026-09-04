import { BadRequestException } from '@nestjs/common';
import { ShippingService } from './shipping.service';

describe('ShippingService', () => {
  const address = {
    userId: 'user-1',
    line1: '1 Main Street',
    city: 'Pune',
    state: 'MH',
    postalCode: '411001',
    country: 'IN',
  };

  function createService(cartItems: unknown[], deliverable = true) {
    const quote = jest
      .fn()
      .mockResolvedValue([{ method: 'STANDARD', fee: 149 }]);
    const validateAddress = jest.fn().mockResolvedValue(deliverable);
    const service = new ShippingService(
      {
        address: { findUnique: jest.fn().mockResolvedValue(address) },
        cart: { findUnique: jest.fn().mockResolvedValue({ items: cartItems }) },
      } as never,
      { quote, validateAddress },
    );
    return { service, quote, validateAddress };
  }

  function item(overrides: Record<string, unknown> = {}) {
    return {
      quantity: 1,
      variant: {
        price: 100,
        currency: 'INR',
        weightGrams: 200,
        deletedAt: null,
        isActive: true,
        product: { deletedAt: null, status: 'ACTIVE' },
        ...overrides,
      },
    };
  }

  it('rejects an undeliverable address before quoting', async () => {
    const { service, quote, validateAddress } = createService([item()], false);

    await expect(
      service.quoteForCart('user-1', 'address-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ADDRESS_UNDELIVERABLE' }),
    });
    expect(validateAddress).toHaveBeenCalled();
    expect(quote).not.toHaveBeenCalled();
  });

  it('rejects unavailable cart variants before quoting', async () => {
    const { service, quote } = createService([item({ isActive: false })]);

    await expect(
      service.quoteForCart('user-1', 'address-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(quote).not.toHaveBeenCalled();
  });

  it('rejects mixed-currency carts before quoting', async () => {
    const { service, quote } = createService([
      item(),
      item({ currency: 'USD' }),
    ]);

    await expect(
      service.quoteForCart('user-1', 'address-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MIXED_CURRENCY_CART' }),
    });
    expect(quote).not.toHaveBeenCalled();
  });

  it('rejects a provider quote with the wrong currency', async () => {
    const { service, quote } = createService([item()]);
    quote.mockResolvedValue([
      {
        method: 'STANDARD',
        label: 'Standard delivery',
        fee: 149,
        currency: 'USD',
        estimatedDaysMin: 5,
        estimatedDaysMax: 7,
      },
    ]);

    await expect(
      service.quoteForCart('user-1', 'address-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_SHIPPING_QUOTE' }),
    });
  });
});
