/** Matches the Prisma `BehavioralEventType` enum (apps/api/prisma/schema.prisma) in full —
 *  apps/web currently only ever emits a subset of these. */
export type BehavioralEventType =
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
  | "RECOMMENDATION_CLICKED"
  | "USER_REGISTERED"
  | "USER_LOGIN"
  | "SEARCH_FILTER_USED"
  | "SEARCH_SORT_USED"
  | "PAYMENT_STARTED"
  | "PAYMENT_COMPLETED"
  | "PRODUCT_REVIEWED"
  | "RECOMMENDATION_VIEWED"
  | "RECOMMENDATION_PURCHASED"
  | "AI_ASSISTANT_PRODUCT_CLICKED"
  | "RETURN_REQUESTED"
  | "REFUND_COMPLETED";

export type EventSource = "WEB" | "MOBILE" | "BACKEND";

/** Matches `TrackEventDto` in apps/api/src/events/dto/track-event.dto.ts. `anonymousId` and
 *  `sessionId` are required on every event, even for an authenticated caller — the backend
 *  identifies the user from the JWT, but these still drive session upsert/identity-linking. */
export type TrackEventInput = {
  eventId: string;
  eventType: BehavioralEventType;
  anonymousId: string;
  sessionId: string;
  source: EventSource;
  entityId?: string;
  metadata?: Record<string, unknown>;
  schemaVersion?: number;
  occurredAt: string;
};

/** Matches `TrackEventsDto` — `POST /events` takes a batch, never a single event. */
export type TrackEventsInput = {
  events: TrackEventInput[];
};

export type TrackEventsResponse = {
  accepted: number;
};

export type ActivityEventItem = {
  id: string;
  eventType: BehavioralEventType;
  entityId: string | null;
  source: EventSource;
  occurredAt: string;
};

export type ListActivityResponse = {
  items: ActivityEventItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** Matches `CustomerProfileService.toView()` — counter maps are keyed by real category/brand
 *  UUIDs, not names (unlike apps/web's old client-only `CustomerProfile`). */
export type BehavioralProfileView = {
  categoryAffinity: {
    viewed: Record<string, number>;
    addedToCart: Record<string, number>;
    purchased: Record<string, number>;
  };
  brandAffinity: {
    viewed: Record<string, number>;
  };
  priceRange: { min: number | null; max: number | null };
  eventCount: number;
  orderCount: number;
  segment: "repeat_buyer" | "buyer" | "engaged_browser" | "browser" | "new";
  lifecycleStage: "prospect" | "first_time_customer" | "repeat_customer";
  firstSeenAt: string;
  lastEventAt: string | null;
};

/** `GET /users/me/behavioral-profile` wraps in `{profile: ...}` — a bare `null` return would
 *  collapse to an empty response body, indistinguishable from no body at all. */
export type GetBehavioralProfileResponse = {
  profile: BehavioralProfileView | null;
};
