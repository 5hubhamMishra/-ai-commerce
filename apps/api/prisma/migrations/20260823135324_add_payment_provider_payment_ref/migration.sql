-- Real Razorpay payment provider integration: providerRef (order id) vs.
-- providerPaymentRef (payment id, needed for refunds — only known after confirmation).
--
-- NOTE: `prisma migrate diff` against this schema also proposed
-- `DROP INDEX "product_embeddings_embedding_hnsw_idx"` — a false positive.
-- Prisma has no way to represent a raw-SQL index on an `Unsupported()`
-- pgvector column in its schema model, so its diff engine sees an index it
-- doesn't recognize and assumes it shouldn't be there. That line has been
-- removed from this migration; the Phase 8 HNSW index is untouched. Read
-- the generated SQL before applying it, every time — same discipline that
-- caught Phase 5's business_name mapping bug (see Phase 9's migration for
-- the same false positive recurring).

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "provider_payment_ref" TEXT;
