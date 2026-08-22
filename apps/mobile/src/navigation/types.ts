/** Shared shape for each tab's own stack — a product can be opened from Shop, Cart, or
 *  Wishlist, and should push within that same tab (tab bar stays visible) rather than
 *  jumping to a separate top-level route. */
export type ProductStackParamList = {
  ProductDetail: { slug: string };
};

export type ShopStackParamList = ProductStackParamList & {
  ShopHome: undefined;
};

export type CartStackParamList = ProductStackParamList & {
  CartHome: undefined;
};

export type WishlistStackParamList = ProductStackParamList & {
  WishlistHome: undefined;
};

export type MainTabParamList = {
  Shop: undefined;
  Cart: undefined;
  Wishlist: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};
