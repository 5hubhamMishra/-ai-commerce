/*
  Warnings:

  - You are about to drop the column `invoice_number` on the `invoices` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "invoices_invoice_number_key";

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "invoice_number";
