import { renderHook, waitFor } from '@testing-library/react-native';
import type { ProductListItem } from '@ai-commerce/types';
import { catalogApi, recommendationsApi } from '@ai-commerce/api-client';
import { useRecommendations } from './useRecommendations';

jest.mock('@ai-commerce/api-client', () => ({
  catalogApi: { listProducts: jest.fn() },
  recommendationsApi: {
    list: jest.fn(),
    trending: jest.fn(),
    similar: jest.fn(),
    frequentlyBoughtWith: jest.fn(),
  },
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
  };
}

beforeEach(() => {
  (catalogApi.listProducts as jest.Mock).mockResolvedValue({
    items: [makeProduct('p1'), makeProduct('p2')],
    total: 2,
    page: 1,
    pageSize: 100,
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('useRecommendations', () => {
  it('resolves scored productIds against the catalog index, dropping unmatched ids', async () => {
    (recommendationsApi.list as jest.Mock).mockResolvedValue([
      { productId: 'p1', score: 0.9, reasons: ['viewed similar'] },
      { productId: 'missing', score: 0.5, reasons: [] },
    ]);

    const { result } = await renderHook(() => useRecommendations('personalized', { limit: 10 }));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toEqual([{ product: makeProduct('p1'), score: 0.9, reasons: ['viewed similar'] }]);
  });

  it('never sends an anonymousId — mobile has no guest path to give one to', async () => {
    (recommendationsApi.list as jest.Mock).mockResolvedValue([]);

    await renderHook(() => useRecommendations('personalized', { limit: 10 }));

    await waitFor(() => expect(recommendationsApi.list).toHaveBeenCalled());
    expect(recommendationsApi.list).toHaveBeenCalledWith({ limit: 10 });
    expect(recommendationsApi.list).not.toHaveBeenCalledWith(expect.objectContaining({ anonymousId: expect.anything() }));
  });

  it('returns null and calls nothing when enabled is false', async () => {
    const { result } = await renderHook(() => useRecommendations('personalized', { enabled: false }));

    expect(result.current).toBeNull();
    expect(recommendationsApi.list).not.toHaveBeenCalled();
  });

  it('returns null and calls nothing for similar/frequentlyBoughtWith without a productId', async () => {
    const similarResult = await renderHook(() => useRecommendations('similar'));
    expect(similarResult.result.current).toBeNull();
    expect(recommendationsApi.similar).not.toHaveBeenCalled();

    const fbwResult = await renderHook(() => useRecommendations('frequentlyBoughtWith'));
    expect(fbwResult.result.current).toBeNull();
    expect(recommendationsApi.frequentlyBoughtWith).not.toHaveBeenCalled();
  });

  it('calls similar/frequentlyBoughtWith/trending with the right productId when provided', async () => {
    (recommendationsApi.similar as jest.Mock).mockResolvedValue([]);
    (recommendationsApi.frequentlyBoughtWith as jest.Mock).mockResolvedValue([]);
    (recommendationsApi.trending as jest.Mock).mockResolvedValue([]);

    await renderHook(() => useRecommendations('similar', { productId: 'p1', limit: 6 }));
    await waitFor(() => expect(recommendationsApi.similar).toHaveBeenCalledWith('p1', { limit: 6 }));

    await renderHook(() => useRecommendations('frequentlyBoughtWith', { productId: 'p1', limit: 3 }));
    await waitFor(() => expect(recommendationsApi.frequentlyBoughtWith).toHaveBeenCalledWith('p1', { limit: 3 }));

    await renderHook(() => useRecommendations('trending', { limit: 10 }));
    await waitFor(() => expect(recommendationsApi.trending).toHaveBeenCalledWith({ limit: 10 }));
  });
});
