-- Reserve return completion before any external refund call so concurrent admins cannot
-- charge the same provider refund twice.
ALTER TYPE "ReturnStatus" ADD VALUE 'PROCESSING' BEFORE 'COMPLETED';

DROP INDEX "return_requests_one_active_per_order_idx";

CREATE UNIQUE INDEX "return_requests_one_active_per_order_idx"
ON "return_requests" ("order_id")
WHERE "status" IN (
  'REQUESTED'::"ReturnStatus",
  'APPROVED'::"ReturnStatus",
  'PICKUP_SCHEDULED'::"ReturnStatus",
  'PICKED_UP'::"ReturnStatus",
  'INSPECTING'::"ReturnStatus",
  'PROCESSING'::"ReturnStatus"
);
