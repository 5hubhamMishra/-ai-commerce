ALTER TYPE "PaymentStatus" ADD VALUE 'PROCESSING' BEFORE 'SUCCEEDED';

DROP INDEX "payments_one_pending_per_order_idx";

CREATE UNIQUE INDEX "payments_one_pending_per_order_idx"
ON "payments" ("order_id")
WHERE "status" IN (
  'PENDING'::"PaymentStatus",
  'PROCESSING'::"PaymentStatus"
);
