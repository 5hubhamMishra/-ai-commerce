-- The enum value is committed by the preceding migration before this index
-- definition references it. PostgreSQL rejects using a new enum value in the
-- same transaction that adds it.
DROP INDEX "payments_one_pending_per_order_idx";

CREATE UNIQUE INDEX "payments_one_pending_per_order_idx"
ON "payments" ("order_id")
WHERE "status" IN (
  'PENDING'::"PaymentStatus",
  'PROCESSING'::"PaymentStatus"
);
