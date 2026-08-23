/** Shared shape for each tab's own stack — a product can be opened from Shop, Cart, or
 *  Wishlist, and should push within that same tab (tab bar stays visible) rather than
 *  jumping to a separate top-level route. */
export type ProductStackParamList = {
  ProductDetail: { slug: string };
};

/** Shared shape for the order-detail screen — reachable from both CartStack (right after
 *  placing an order) and AccountStack (via My Orders), same cross-stack pattern as
 *  ProductStackParamList above. */
export type OrderStackParamList = {
  OrderDetail: { id: string };
};

export type ShopStackParamList = ProductStackParamList & {
  ShopHome: undefined;
};

export type CartStackParamList = ProductStackParamList &
  OrderStackParamList & {
    CartHome: undefined;
    Checkout: undefined;
  };

export type WishlistStackParamList = ProductStackParamList & {
  WishlistHome: undefined;
};

export type AccountStackParamList = OrderStackParamList & {
  AccountHome: undefined;
  OrderList: undefined;
};

export type ShopAIStackParamList = {
  ShopAIHome: undefined;
};

export type MainTabParamList = {
  Shop: undefined;
  ShopAI: undefined;
  Cart: undefined;
  Wishlist: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};
