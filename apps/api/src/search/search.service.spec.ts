import { matchesMetadata } from './search.service';

describe('search price filtering', () => {
  const product = {
    category: { slug: 'accessories' },
    brand: null,
    variants: [{ price: 50 }, { price: 150 }],
  };

  it('matches when any active variant falls inside the requested price range', () => {
    expect(
      matchesMetadata(product as never, {
        minPrice: 100,
        maxPrice: 200,
      }),
    ).toBe(true);
  });

  it('rejects a product when no variant falls inside the requested price range', () => {
    expect(
      matchesMetadata(product as never, {
        minPrice: 200,
        maxPrice: 300,
      }),
    ).toBe(false);
  });
});
