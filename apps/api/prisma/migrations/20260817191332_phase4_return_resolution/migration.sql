/*
  Warnings:

  - Added the required column `resolution` to the `return_requests` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ReturnResolution" AS ENUM ('REFUND', 'REPLACEMENT', 'EXCHANGE');

-- AlterTable
ALTER TABLE "return_requests" ADD COLUMN     "desired_variant_id" TEXT,
ADD COLUMN     "resolution" "ReturnResolution" NOT NULL;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_desired_variant_id_fkey" FOREIGN KEY ("desired_variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
