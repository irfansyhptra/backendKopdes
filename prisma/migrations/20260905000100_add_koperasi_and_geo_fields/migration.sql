-- Koperasi (Kopdes) + koordinat untuk pencarian terdekat.
--
-- Tabel Koperasi dibuat multi-baris sejak awal supaya SUPER_ADMIN tinggal
-- menambah record untuk desa lain tanpa refactor skema lagi.
--
-- Product.kopdesId dan UMKM.kopdesId sengaja NULLABLE: 20 produk dan 3 UMKM
-- yang sudah ada terdaftar sebelum kolom ini ada. Keduanya di-backfill ke
-- Kopdes default setelah migration ini, dan bisa dijadikan NOT NULL lewat
-- migration terpisah setelah alur pembuatan Kopdes oleh super admin berjalan.
--
-- UMKM.latitude/longitude juga nullable — UMKM tanpa koordinat tidak akan
-- muncul di hasil pencarian terdekat, dan itu perilaku yang benar.

-- CreateEnum
CREATE TYPE "UMKMCategory" AS ENUM ('KULINER', 'SWALAYAN', 'MINUMAN', 'KERAJINAN', 'JASA', 'LAINNYA');

-- CreateTable
CREATE TABLE "Koperasi" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "imageUrl" TEXT,
    "address" TEXT NOT NULL,
    "village" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "phone" TEXT,
    "operatingHours" JSONB,
    "serviceCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Koperasi_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "kopdesId" TEXT;

-- AlterTable
ALTER TABLE "UMKM" ADD COLUMN     "category" "UMKMCategory" NOT NULL DEFAULT 'LAINNYA',
ADD COLUMN     "kopdesId" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "operatingHours" JSONB,
ADD COLUMN     "photoUrl" TEXT;

-- CreateIndex
-- Filter kasar bounding-box memakai index ini sebelum Haversine dihitung.
CREATE INDEX "Koperasi_latitude_longitude_idx" ON "Koperasi"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Koperasi_isActive_idx" ON "Koperasi"("isActive");

-- CreateIndex
CREATE INDEX "Product_kopdesId_idx" ON "Product"("kopdesId");

-- CreateIndex
CREATE INDEX "UMKM_latitude_longitude_idx" ON "UMKM"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "UMKM_category_idx" ON "UMKM"("category");

-- CreateIndex
CREATE INDEX "UMKM_kopdesId_idx" ON "UMKM"("kopdesId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_kopdesId_fkey" FOREIGN KEY ("kopdesId") REFERENCES "Koperasi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UMKM" ADD CONSTRAINT "UMKM_kopdesId_fkey" FOREIGN KEY ("kopdesId") REFERENCES "Koperasi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
