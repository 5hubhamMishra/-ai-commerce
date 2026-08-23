import type { Address } from './address';
import type { Role } from './roles';

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  roles: Role[];
};

export type Profile = {
  id: string;
  userId: string;
  phone?: string | null;
  personalizationEnabled: boolean;
  notificationPreferences: Record<string, unknown>;
};

/** Matches `DeleteAccountDto` — `DELETE /users/me` requires a password re-check so a
 *  hijacked access token alone can never be enough to destroy an account. */
export type DeleteAccountInput = {
  password: string;
};

/** Matches `UsersService.exportData()`'s envelope (spec PRIVACY: "data export"). The
 *  `orders`/`cart`/`wishlist`/`shopaiConversations`/`supportTickets` sections are the real,
 *  raw stored rows (Prisma's own shape, not each domain's own friendlier response mapper —
 *  an export should hand back what's actually stored, not a UI-shaped view of it), so
 *  they're intentionally typed loosely here rather than reusing e.g. `OrderDetail`, which
 *  documents a different (mapped) contract. */
export type ExportDataResponse = {
  exportedAt: string;
  account: {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    roles: Role[];
  };
  profile: Profile | null;
  addresses: Address[];
  orders: Record<string, unknown>[];
  cart: Record<string, unknown> | null;
  wishlist: Record<string, unknown>[];
  activity: Record<string, unknown>[];
  customerProfile: Record<string, unknown> | null;
  notifications: Record<string, unknown>[];
  shopaiConversations: Record<string, unknown>[];
  supportTickets: Record<string, unknown>[];
};
