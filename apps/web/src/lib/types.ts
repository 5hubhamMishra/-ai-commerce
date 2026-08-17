export type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  subcategory?: string;
  price: number;
  compareAtPrice?: number;
  rating: number;
  reviewCount: number;
  description: string;
  specs: Record<string, string>;
  tags: string[];
  images: string[];
  stock: number;
  featured?: boolean;
  useCases?: string[];
};

export type Review = {
  id: string;
  productId: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean;
};

export type CartItem = {
  productId: string;
  quantity: number;
};

export type Order = {
  id: string;
  items: { productId: string; quantity: number; priceAtPurchase: number }[];
  total: number;
  status: "processing" | "confirmed" | "shipped" | "delivered" | "cancelled";
  placedAt: string;
  address: string;
};

export type EventType =
  | "PRODUCT_VIEWED"
  | "PRODUCT_CLICKED"
  | "PRODUCT_SEARCHED"
  | "PRODUCT_COMPARED"
  | "PRODUCT_WISHLISTED"
  | "PRODUCT_REMOVED_FROM_WISHLIST"
  | "PRODUCT_ADDED_TO_CART"
  | "PRODUCT_REMOVED_FROM_CART"
  | "CHECKOUT_STARTED"
  | "ORDER_COMPLETED"
  | "CATEGORY_VIEWED"
  | "FILTER_USED"
  | "AI_ASSISTANT_QUERY"
  | "RECOMMENDATION_CLICKED";

export type BehaviorEvent = {
  eventType: EventType;
  productId?: string;
  category?: string;
  brand?: string;
  query?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
};

export type CustomerProfile = {
  categoryAffinity: Record<string, number>;
  brandAffinity: Record<string, number>;
  priceRangeMin: number;
  priceRangeMax: number;
  segment: string;
  lifecycleStage: string;
  intentConfidence: number;
  currentIntent: string | null;
};
