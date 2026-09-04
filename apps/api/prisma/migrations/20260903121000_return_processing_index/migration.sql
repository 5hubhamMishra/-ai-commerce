-- The enum value is committed by the preceding migration before this index
-- definition references it. PostgreSQL rejects using a new enum value in the
-- same transaction that adds it.
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
