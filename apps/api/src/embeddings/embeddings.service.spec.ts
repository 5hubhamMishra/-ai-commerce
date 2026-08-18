import { cosineSimilarity } from './embeddings.service';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [0.6, 0.8, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([0.6, 0.8], [-0.6, -0.8])).toBeCloseTo(-1, 10);
  });

  it('is symmetric', () => {
    const a = [0.1, -0.2, 0.9, 0.3];
    const b = [0.4, 0.4, -0.1, 0.8];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it('only compares over the overlapping length of mismatched vectors', () => {
    const a = [1, 0, 0];
    const b = [1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 10);
  });
});
