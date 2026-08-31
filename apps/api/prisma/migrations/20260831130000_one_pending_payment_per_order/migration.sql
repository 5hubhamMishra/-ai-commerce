CREATE UNIQUE INDEX "payments_one_pending_per_order_idx"
ON "payments" ("order_id")
WHERE "status" = 'PENDING'::"PaymentStatus";
