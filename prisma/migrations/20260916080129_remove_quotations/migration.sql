/*
  Warnings:

  - You are about to drop the column `quotationId` on the `Sow` table. All the data in the column will be lost.
  - You are about to drop the `Quotation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `QuotationItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Quotation" DROP CONSTRAINT "Quotation_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Quotation" DROP CONSTRAINT "Quotation_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Quotation" DROP CONSTRAINT "Quotation_leadId_fkey";

-- DropForeignKey
ALTER TABLE "QuotationItem" DROP CONSTRAINT "QuotationItem_quotationId_fkey";

-- DropForeignKey
ALTER TABLE "Sow" DROP CONSTRAINT "Sow_quotationId_fkey";

-- AlterTable
ALTER TABLE "Sow" DROP COLUMN "quotationId";

-- DropTable
DROP TABLE "Quotation";

-- DropTable
DROP TABLE "QuotationItem";

-- DropEnum
DROP TYPE "QuotationStatus";
