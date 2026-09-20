-- Pengelompokan kategori untuk dua baris filter di Marketplace.
--
-- Tanpa kolom ini, "Filter Makanan" dan "Filter Barang Ritel" hanya bisa
-- ditebak dari nama kategori, dan tebakan itu meleset begitu pengurus
-- menambah kategori baru.

-- CreateEnum
CREATE TYPE "CategoryGroup" AS ENUM ('FOOD', 'RETAIL');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "group" "CategoryGroup" NOT NULL DEFAULT 'RETAIL';

-- CreateIndex
CREATE INDEX "Category_group_idx" ON "Category"("group");

