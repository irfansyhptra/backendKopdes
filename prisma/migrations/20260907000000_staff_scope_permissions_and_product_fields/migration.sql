-- Pemisahan wewenang PEGAWAI_KOPDES dari ADMIN_KOPDES, plus field katalog
-- yang dibutuhkan form Input Barang pegawai.
--
-- Tanpa User.kopdesId tidak ada cara membatasi seorang pegawai pada desanya
-- sendiri: seluruh query staf sebelumnya berjalan lintas Kopdes.
-- User.permissions kosong berarti "pakai bawaan role" (src/common/permissions.ts).

-- AlterTable: penugasan staf & penyempitan permission
ALTER TABLE "User" ADD COLUMN "kopdesId" TEXT;
ALTER TABLE "User" ADD COLUMN "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "User_kopdesId_idx" ON "User"("kopdesId");

ALTER TABLE "User" ADD CONSTRAINT "User_kopdesId_fkey"
  FOREIGN KEY ("kopdesId") REFERENCES "Koperasi"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: field katalog Kopdes
ALTER TABLE "Product" ADD COLUMN "discountPrice" DECIMAL(12,2);
ALTER TABLE "Product" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'pcs';
ALTER TABLE "Product" ADD COLUMN "sku" TEXT;
ALTER TABLE "Product" ADD COLUMN "minStock" INTEGER NOT NULL DEFAULT 5;

-- SKU unik per Kopdes, bukan global: dua desa boleh memakai kode yang sama.
CREATE UNIQUE INDEX "Product_kopdesId_sku_key" ON "Product"("kopdesId", "sku");

-- Staf yang sudah ada dipasang ke Kopdes pertama supaya dashboard mereka
-- tidak langsung kosong setelah deploy. Hanya berlaku bila persis satu
-- Koperasi terdaftar — pada instalasi multi-desa penugasan wajib manual
-- lewat Super Admin, dan menebaknya di sini justru berbahaya.
UPDATE "User"
SET "kopdesId" = (SELECT "id" FROM "Koperasi" LIMIT 1)
WHERE "role" IN ('ADMIN_KOPDES', 'PEGAWAI_KOPDES')
  AND "kopdesId" IS NULL
  AND (SELECT COUNT(*) FROM "Koperasi") = 1;
