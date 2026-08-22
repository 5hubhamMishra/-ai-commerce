/** Matches `GET /comparison`'s response — apps/api/src/comparison/comparison.service.ts.
 *  Stateless by design: which product ids to compare is client-owned local state; this
 *  endpoint only answers "given these ids, here's the side-by-side spec table." No rating/
 *  review data — apps/api has no reviews model at all. */
export type ComparisonItem = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string;
  imageUrl: string | null;
  minPrice: number | null;
  maxPrice: number | null;
};

export type ComparisonAttributeRow = {
  key: string;
  /** One value per item, in the same order as `items` — null if that product has no such spec. */
  values: (string | null)[];
};

export type ComparisonAttributeGroup = {
  group: string;
  rows: ComparisonAttributeRow[];
};

export type ComparisonResponse = {
  items: ComparisonItem[];
  attributeMatrix: ComparisonAttributeGroup[];
};
