-- Komponen uang pesanan dipisah, dan ulasan dibatasi satu per produk.
--
-- Sebelumnya hanya `totalAmount` yang tersimpan, sehingga rekap keuangan
-- tidak bisa melaporkan ongkir maupun diskon dan harus mengirim null.
-- Kolom `subtotal` diisi dari total lama: pesanan yang sudah ada memang
-- belum pernah membebankan ongkir atau diskon, jadi keduanya nol dan
-- subtotal sama dengan totalnya.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "shippingFee" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "Order" SET "subtotal" = "totalAmount" WHERE "subtotal" = 0;

-- Ulasan: satu pengguna satu ulasan per produk.
-- Baris duplikat yang mungkin sudah ada dibuang lebih dulu, menyisakan
-- ulasan terbaru — tanpa ini pembuatan unique index akan gagal.
DELETE FROM "Review" r
USING "Review" newer
WHERE r."productId" IS NOT NULL
  AND r."userId" = newer."userId"
  AND r."productId" = newer."productId"
  AND r."createdAt" < newer."createdAt";

DELETE FROM "Review" r
USING "Review" newer
WHERE r."umkmProductId" IS NOT NULL
  AND r."userId" = newer."userId"
  AND r."umkmProductId" = newer."umkmProductId"
  AND r."createdAt" < newer."createdAt";

CREATE UNIQUE INDEX "Review_userId_productId_key" ON "Review"("userId", "productId");
CREATE UNIQUE INDEX "Review_userId_umkmProductId_key" ON "Review"("userId", "umkmProductId");
CREATE INDEX "Review_productId_idx" ON "Review"("productId");
CREATE INDEX "Review_umkmProductId_idx" ON "Review"("umkmProductId");
