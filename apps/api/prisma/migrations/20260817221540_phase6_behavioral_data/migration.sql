-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('WEB', 'MOBILE', 'BACKEND');

-- CreateEnum
CREATE TYPE "BehavioralEventType" AS ENUM ('PRODUCT_VIEWED', 'PRODUCT_CLICKED', 'PRODUCT_SEARCHED', 'PRODUCT_COMPARED', 'PRODUCT_WISHLISTED', 'PRODUCT_REMOVED_FROM_WISHLIST', 'PRODUCT_ADDED_TO_CART', 'PRODUCT_REMOVED_FROM_CART', 'CHECKOUT_STARTED', 'ORDER_COMPLETED', 'CATEGORY_VIEWED', 'FILTER_USED', 'AI_ASSISTANT_QUERY', 'RECOMMENDATION_CLICKED', 'USER_REGISTERED', 'USER_LOGIN', 'SEARCH_FILTER_USED', 'SEARCH_SORT_USED', 'PAYMENT_STARTED', 'PAYMENT_COMPLETED', 'PRODUCT_REVIEWED', 'RECOMMENDATION_VIEWED', 'RECOMMENDATION_PURCHASED', 'AI_ASSISTANT_PRODUCT_CLICKED', 'RETURN_REQUESTED', 'REFUND_COMPLETED');

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "anonymous_id" TEXT NOT NULL,
    "user_id" TEXT,
    "source" "EventSource" NOT NULL DEFAULT 'WEB',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavioral_events" (
    "id" TEXT NOT NULL,
    "event_type" "BehavioralEventType" NOT NULL,
    "user_id" TEXT,
    "anonymous_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "source" "EventSource" NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behavioral_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "anonymous_id" TEXT,
    "category_view_counts" JSONB NOT NULL DEFAULT '{}',
    "category_cart_counts" JSONB NOT NULL DEFAULT '{}',
    "category_purchase_counts" JSONB NOT NULL DEFAULT '{}',
    "brand_view_counts" JSONB NOT NULL DEFAULT '{}',
    "price_observed_min" DECIMAL(12,2),
    "price_observed_max" DECIMAL(12,2),
    "event_count" INTEGER NOT NULL DEFAULT 0,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_event_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_anonymous_id_idx" ON "sessions"("anonymous_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "behavioral_events_user_id_idx" ON "behavioral_events"("user_id");

-- CreateIndex
CREATE INDEX "behavioral_events_anonymous_id_idx" ON "behavioral_events"("anonymous_id");

-- CreateIndex
CREATE INDEX "behavioral_events_session_id_idx" ON "behavioral_events"("session_id");

-- CreateIndex
CREATE INDEX "behavioral_events_event_type_idx" ON "behavioral_events"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_user_id_key" ON "customer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_anonymous_id_key" ON "customer_profiles"("anonymous_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_events" ADD CONSTRAINT "behavioral_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_events" ADD CONSTRAINT "behavioral_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
