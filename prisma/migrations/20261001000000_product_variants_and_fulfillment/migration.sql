-- Varian produk, satuan baku, dan cara pemenuhan pesanan.
--
-- Tiga perubahan yang saling terkait:
--
-- 1. `Product.unit` sebelumnya teks bebas dengan bawaan "pcs". Dua Kopdes
--    menulis "kg", "Kg", dan "kilogram" untuk barang yang sama, sehingga
--    ringkasan stok lintas desa tidak bisa dijumlahkan. Sekarang enum.
--
-- 2. `ProductVariant` opsional. Produk tanpa varian tetap sah; harga, stok,
--    dan satuannya ada di produknya sendiri. Kolom varian yang null berarti
--    "ikut induknya" — menyalin nilai induk ke tiap varian membuat perubahan
--    harga harus ditulis berkali-kali, dan satu yang terlewat menjual barang
--    dengan harga lama.
--
-- 3. `Order.fulfillment` memisahkan cara menerima barang dari cara membayar.
--    Keduanya memang dua keputusan: COD hanya masuk akal bersama pengantaran,
--    sementara bayar di muka berlaku untuk keduanya.

CREATE TYPE "ProductUnit" AS ENUM (
    'PCS', 'PACK', 'BOX', 'DUS', 'SACHET', 'BOTOL', 'KALENG',
    'RENTENG', 'LUSIN', 'IKAT', 'KARUNG',
    'GRAM', 'KILOGRAM', 'MILILITER', 'LITER'
);

CREATE TYPE "FulfillmentMethod" AS ENUM ('PICKUP', 'DELIVERY');

-- ── 1. Satuan produk ─────────────────────────────────────────────────────
--
-- Dipetakan dari teks lama, bukan dihapus: baris yang satuannya sudah terisi
-- benar tidak boleh berubah jadi "PCS" diam-diam. Yang tidak dikenali jatuh
-- ke PCS, satuan bawaan yang lama.
ALTER TABLE "Product" ADD COLUMN "unit_new" "ProductUnit" NOT NULL DEFAULT 'PCS';

UPDATE "Product" SET "unit_new" = CASE lower(trim("unit"))
    WHEN 'pack'      THEN 'PACK'::"ProductUnit"
    WHEN 'bungkus'   THEN 'PACK'::"ProductUnit"
    WHEN 'box'       THEN 'BOX'::"ProductUnit"
    WHEN 'dus'       THEN 'DUS'::"ProductUnit"
    WHEN 'sachet'    THEN 'SACHET'::"ProductUnit"
    WHEN 'botol'     THEN 'BOTOL'::"ProductUnit"
    WHEN 'kaleng'    THEN 'KALENG'::"ProductUnit"
    WHEN 'renteng'   THEN 'RENTENG'::"ProductUnit"
    WHEN 'lusin'     THEN 'LUSIN'::"ProductUnit"
    WHEN 'ikat'      THEN 'IKAT'::"ProductUnit"
    WHEN 'karung'    THEN 'KARUNG'::"ProductUnit"
    WHEN 'g'         THEN 'GRAM'::"ProductUnit"
    WHEN 'gr'        THEN 'GRAM'::"ProductUnit"
    WHEN 'gram'      THEN 'GRAM'::"ProductUnit"
    WHEN 'kg'        THEN 'KILOGRAM'::"ProductUnit"
    WHEN 'kilogram'  THEN 'KILOGRAM'::"ProductUnit"
    WHEN 'ml'        THEN 'MILILITER'::"ProductUnit"
    WHEN 'mililiter' THEN 'MILILITER'::"ProductUnit"
    WHEN 'l'         THEN 'LITER'::"ProductUnit"
    WHEN 'liter'     THEN 'LITER'::"ProductUnit"
    ELSE 'PCS'::"ProductUnit"
END;

ALTER TABLE "Product" DROP COLUMN "unit";
ALTER TABLE "Product" RENAME COLUMN "unit_new" TO "unit";

-- ── 2. Varian ────────────────────────────────────────────────────────────
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "price" DECIMAL(12,2),
    "stock" INTEGER,
    "unit" "ProductUnit",
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- Harga dan stok varian tidak boleh negatif. Dijaga database, bukan hanya
-- kode: satu jalur yang lupa memeriksa sudah cukup untuk menjual stok minus.
ALTER TABLE "ProductVariant"
    ADD CONSTRAINT "ProductVariant_price_not_negative" CHECK ("price" IS NULL OR "price" >= 0);
ALTER TABLE "ProductVariant"
    ADD CONSTRAINT "ProductVariant_stock_not_negative" CHECK ("stock" IS NULL OR "stock" >= 0);

CREATE UNIQUE INDEX "ProductVariant_productId_name_key" ON "ProductVariant"("productId", "name");
CREATE UNIQUE INDEX "ProductVariant_productId_sku_key" ON "ProductVariant"("productId", "sku");
CREATE INDEX "ProductVariant_productId_isActive_idx" ON "ProductVariant"("productId", "isActive");

ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 3. Varian pada keranjang & pesanan ───────────────────────────────────
ALTER TABLE "CartItem" ADD COLUMN "variantId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "variantId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "variantName" TEXT;

ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Kunci unik keranjang kini memuat varian: dua kemasan berbeda dari produk
-- yang sama adalah dua baris, bukan satu baris yang jumlahnya bertambah.
--
-- Postgres memperlakukan NULL sebagai tidak sama dengan NULL pada indeks
-- unik, jadi produk tanpa varian akan lolos berkali-kali. `NULLS NOT
-- DISTINCT` mengembalikan perilaku lama untuk baris tanpa varian.
DROP INDEX IF EXISTS "CartItem_cartId_productId_key";
CREATE UNIQUE INDEX "CartItem_cartId_productId_variantId_key"
    ON "CartItem"("cartId", "productId", "variantId") NULLS NOT DISTINCT;

-- ── 4. Cara pemenuhan pesanan ────────────────────────────────────────────
--
-- Bawaannya DELIVERY: seluruh pesanan yang sudah ada punya alamat antar dan
-- memang diantar, jadi menandainya PICKUP akan memalsukan riwayat.
ALTER TABLE "Order" ADD COLUMN "fulfillment" "FulfillmentMethod" NOT NULL DEFAULT 'DELIVERY';

-- COD hanya berlaku untuk pengantaran. Membayar di tempat saat mengambil
-- sendiri sama saja dengan transaksi kasir, yang punya alurnya sendiri.
ALTER TABLE "Order" ADD CONSTRAINT "Order_cod_requires_delivery"
    CHECK ("paymentMethod" <> 'COD' OR "fulfillment" = 'DELIVERY');
