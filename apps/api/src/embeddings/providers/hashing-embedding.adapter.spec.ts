import { HashingEmbeddingAdapter } from './hashing-embedding.adapter';
import type { EmbeddingInput } from './embedding-provider.interface';

function input(overrides: Partial<EmbeddingInput> = {}): EmbeddingInput {
  return {
    productId: 'p1',
    name: 'Wireless Headphones',
    description: 'Noise-cancelling over-ear headphones with long battery life',
    categoryId: 'cat-headphones',
    brandId: 'brand-acme',
    tags: ['wireless', 'bluetooth'],
    specificationValues: ['30h battery', 'Bluetooth 5.2'],
    ...overrides,
  };
}

describe('HashingEmbeddingAdapter', () => {
  const adapter = new HashingEmbeddingAdapter();

  it('produces a vector of the declared dimensionality', async () => {
    const { vector } = await adapter.embed(input());
    expect(vector.length).toBe(adapter.dimensions);
  });

  it('is deterministic for identical input', async () => {
    const a = await adapter.embed(input());
    const b = await adapter.embed(input());
    expect(a.vector).toEqual(b.vector);
  });

  it('L2-normalizes the output vector to unit length', async () => {
    const { vector } = await adapter.embed(input());
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 8);
  });

  it('produces different vectors for products in different categories', async () => {
    const a = await adapter.embed(input({ categoryId: 'cat-headphones' }));
    const b = await adapter.embed(
      input({ categoryId: 'cat-laptops', tags: [], specificationValues: [] }),
    );
    expect(a.vector).not.toEqual(b.vector);
  });

  it('produces the same vector regardless of brandId when brandId is omitted both times', async () => {
    const a = await adapter.embed(input({ brandId: null }));
    const b = await adapter.embed(input({ brandId: null }));
    expect(a.vector).toEqual(b.vector);
  });

  it('never produces NaN/Infinity even for near-empty input', async () => {
    const { vector } = await adapter.embed(
      input({
        name: '',
        description: '',
        categoryId: '',
        brandId: null,
        tags: [],
        specificationValues: [],
      }),
    );
    expect(vector.every((v) => Number.isFinite(v))).toBe(true);
  });
});
