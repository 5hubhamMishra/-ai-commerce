-- Reserve return completion before any external refund call so concurrent admins cannot
-- charge the same provider refund twice.
ALTER TYPE "ReturnStatus" ADD VALUE 'PROCESSING' BEFORE 'COMPLETED';
