import { diversify, type ScoredProduct } from './recommendations.service';

function item(productId: string, score: number): ScoredProduct {
  return { productId, score, reasons: [] };
}

describe('diversify', () => {
  it('keeps original order when everything is already in distinct categories', () => {
    const sorted = [item('a', 10), item('b', 9), item('c', 8)];
    const categories: [string, string][] = [
      ['a', 'cat-1'],
      ['b', 'cat-2'],
      ['c', 'cat-3'],
    ];
    const result = diversify(sorted, categories, 3);
    expect(result.map((r) => r.productId)).toEqual(['a', 'b', 'c']);
  });

  it('caps how many items from one category can occupy the top of the ranking', () => {
    // 3 cat-1 items outrank 3 cat-2 items. With limit 4 and
    // MAX_CATEGORY_SHARE = 0.4, each category is capped at ceil(4*0.4) = 2,
    // so the 3rd-ranked cat-1 item (a3) should lose its slot to a lower-
    // ranked cat-2 item (b2) instead of both top-4 slots going to cat-1.
    const sorted = [
      item('a1', 10),
      item('a2', 9),
      item('a3', 8),
      item('b1', 7),
      item('b2', 6),
      item('b3', 5),
    ];
    const categories: [string, string][] = [
      ['a1', 'cat-1'],
      ['a2', 'cat-1'],
      ['a3', 'cat-1'],
      ['b1', 'cat-2'],
      ['b2', 'cat-2'],
      ['b3', 'cat-2'],
    ];
    const result = diversify(sorted, categories, 4);
    const cat1Count = result.filter((r) => r.productId.startsWith('a')).length;
    expect(cat1Count).toBeLessThanOrEqual(2);
    expect(result.map((r) => r.productId)).toEqual(['a1', 'a2', 'b1', 'b2']);
  });

  it('backfills from deferred items once every category cap is hit and slots remain', () => {
    // Only one category exists, so the cap can never be satisfied by another
    // category — the deferred backfill must still fill up to `limit`.
    const sorted = [item('a', 5), item('b', 4), item('c', 3), item('d', 2)];
    const categories: [string, string][] = [
      ['a', 'cat-1'],
      ['b', 'cat-1'],
      ['c', 'cat-1'],
      ['d', 'cat-1'],
    ];
    const result = diversify(sorted, categories, 4);
    expect(result.map((r) => r.productId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never returns more than limit items', () => {
    const sorted = Array.from({ length: 20 }, (_, i) => item(`p${i}`, 20 - i));
    const categories: [string, string][] = sorted.map((s, i) => [
      s.productId,
      `cat-${i % 3}`,
    ]);
    const result = diversify(sorted, categories, 5);
    expect(result.length).toBe(5);
  });

  it('treats a product with no known category as its own bucket without throwing', () => {
    const sorted = [item('a', 5), item('b', 4)];
    const result = diversify(sorted, [], 2);
    expect(result.map((r) => r.productId)).toEqual(['a', 'b']);
  });
});
