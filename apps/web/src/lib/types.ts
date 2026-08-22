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

export type CartItem = {
  productId: string;
  quantity: number;
};

export type OrderItem = {
  productId: string;
  quantity: number;
  priceAtPurchase: number;
  // Optional snapshot for orders sourced from the real cart — real product IDs aren't
  // resolvable via this file's static getProduct(), so orders/[id]/page.tsx prefers these
  // when present, falling back to a getProduct() lookup for legacy fake-catalog orders.
  productName?: string;
  productImageUrl?: string | null;
};

export type Order = {
  id: string;
  items: OrderItem[];
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

