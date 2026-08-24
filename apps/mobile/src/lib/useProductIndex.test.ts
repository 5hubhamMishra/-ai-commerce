import { renderHook, waitFor } from '@testing-library/react-native';
import type { ProductListItem } from '@ai-commerce/types';
import { catalogApi } from '@ai-commerce/api-client';
import { useProductIndex } from './useProductIndex';

jest.mock('@ai-commerce/api-client', () => ({
  catalogApi: { listProducts: jest.fn() },
}));

function makeProduct(id: string): ProductListItem {
  return {
    id,
    slug: id,
    name: id,
    status: 'ACTIVE',
    isFeatured: false,
    category: { id: 'c1', name: 'Accessories', slug: 'accessories' },
    brand: null,
    seller: null,
    currency: 'INR',
    minPrice: 100,
    maxPrice: 100,
    primaryImageUrl: null,
    inStock: true,
    rating: null,
    reviewCount: 0,
  };
}

// The cache useProductIndex builds is deliberately module-level (outside any component) so
// every consumer across the running app shares one fetch — the same thing this test exercises
// by mounting the hook twice within a single test rather than across separate tests. Resetting
// the module between test cases (jest.resetModules() + a fresh require()) isn't viable here:
// @testing-library/react-native registers global afterEach/beforeAll/afterAll cleanup hooks at
// module-load time, and re-requiring it mid-test trips Jest's "hooks cannot be defined inside
// tests" guard. A single test mounting the hook twice is also the more faithful scenario anyway
// — that's exactly how the cache gets reused in the real app (multiple screens, one process).
describe('useProductIndex', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('paginates until total is covered, then serves a second consumer from cache with no extra calls', async () => {
    (catalogApi.listProducts as jest.Mock)
      .mockResolvedValueOnce({ items: [makeProduct('p1')], total: 2, page: 1, pageSize: 1 })
      .mockResolvedValueOnce({ items: [makeProduct('p2')], total: 2, page: 2, pageSize: 1 });

    const first = await renderHook(() => useProductIndex());

    await waitFor(() => expect(first.result.current?.size).toBe(2));
    expect(first.result.current?.get('p1')?.id).toBe('p1');
    expect(first.result.current?.get('p2')?.id).toBe('p2');
    expect(catalogApi.listProducts).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 100 });
    expect(catalogApi.listProducts).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 100 });

    const second = await renderHook(() => useProductIndex());
    expect(second.result.current?.size).toBe(2);
    expect(catalogApi.listProducts).toHaveBeenCalledTimes(2); // no additional calls
  });
});
