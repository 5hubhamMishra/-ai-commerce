import { RuleBasedQueryUnderstandingAdapter } from './rule-based-query-understanding.adapter';

const CATEGORIES = [
  { slug: 'laptops', name: 'Laptops' },
  { slug: 'headphones', name: 'Headphones' },
  { slug: 'smartphones', name: 'Smartphones' },
  { slug: 'gaming', name: 'Gaming' },
  { slug: 'wearables', name: 'Wearables' },
  { slug: 'cameras', name: 'Cameras' },
  { slug: 'home-audio', name: 'Home Audio' },
  { slug: 'accessories', name: 'Accessories' },
];
const BRANDS = [
  { slug: 'sony', name: 'Sony' },
  { slug: 'hp', name: 'HP' },
  { slug: 'jbl', name: 'JBL' },
  { slug: 'asus-rog', name: 'ASUS ROG' },
];
const context = { categories: CATEGORIES, brands: BRANDS };

describe('RuleBasedQueryUnderstandingAdapter', () => {
  const adapter = new RuleBasedQueryUnderstandingAdapter();

  it("parses the spec's own worked example", () => {
    const result = adapter.parse(
      'good headphones for gym under ₹5000',
      context,
    );
    expect(result.category).toBe('headphones');
    expect(result.maxPrice).toBe(5000);
    expect(result.minPrice).toBeNull();
    expect(result.attributes).toEqual(
      expect.arrayContaining(['wireless', 'lightweight', 'sweat-resistant']),
    );
    expect(result.cleanedQuery).not.toMatch(/under|5000/i);
  });

  it('extracts a plain numeric max price without a currency symbol', () => {
    const result = adapter.parse('laptop under 50000', context);
    expect(result.maxPrice).toBe(50000);
    expect(result.category).toBe('laptops');
  });

  it('extracts a comma-formatted price', () => {
    const result = adapter.parse('headphones under $1,200', context);
    expect(result.maxPrice).toBe(1200);
  });

  it('extracts a minimum price', () => {
    const result = adapter.parse('cameras above 20000', context);
    expect(result.minPrice).toBe(20000);
    expect(result.maxPrice).toBeNull();
  });

  it('extracts both a minimum and maximum price', () => {
    const result = adapter.parse('smartphones over 10000 under 30000', context);
    expect(result.minPrice).toBe(10000);
    expect(result.maxPrice).toBe(30000);
  });

  it('resolves a category synonym not present as a literal category name', () => {
    const result = adapter.parse('best earbuds for travel', context);
    expect(result.category).toBe('headphones');
    expect(result.attributes).toEqual(expect.arrayContaining(['travel']));
  });

  it('matches a multi-word category name', () => {
    const result = adapter.parse('home audio under 15000', context);
    expect(result.category).toBe('home-audio');
  });

  it('matches a brand name, including a short acronym, as a whole word only', () => {
    expect(adapter.parse('Sony headphones', context).brand).toBe('sony');
    expect(adapter.parse('HP laptop', context).brand).toBe('hp');
    // "cheap" must not false-match the "hp" brand as a substring.
    expect(adapter.parse('cheap laptop', context).brand).toBeNull();
  });

  it('matches a multi-word brand name', () => {
    expect(adapter.parse('ASUS ROG gaming laptop', context).brand).toBe(
      'asus-rog',
    );
  });

  it('returns nulls and an empty attribute list when nothing is recognized', () => {
    const result = adapter.parse('xyzzy plugh', context);
    expect(result.category).toBeNull();
    expect(result.brand).toBeNull();
    expect(result.minPrice).toBeNull();
    expect(result.maxPrice).toBeNull();
    expect(result.attributes).toEqual([]);
    expect(result.cleanedQuery).toBe('xyzzy plugh');
  });

  it('is case-insensitive', () => {
    const result = adapter.parse('WIRELESS Headphones UNDER 5000', context);
    expect(result.category).toBe('headphones');
    expect(result.maxPrice).toBe(5000);
    expect(result.attributes).toContain('wireless');
  });
});
