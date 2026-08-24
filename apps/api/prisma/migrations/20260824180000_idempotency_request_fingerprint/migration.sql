-- Store a deterministic request fingerprint with each idempotency claim so a
-- client cannot reuse the same key for a different irreversible operation.
ALTER TABLE "idempotency_keys"
ADD COLUMN "request_fingerprint" TEXT;
