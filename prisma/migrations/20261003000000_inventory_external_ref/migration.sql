-- Nomor struk dari sistem luar (kasir POS) pada catatan pergerakan stok.
--
-- Unik, dan boleh NULL: hanya pergerakan yang datang dari luar membawanya,
-- sedangkan checkout dan penyesuaian manual di aplikasi ini tidak. Postgres
-- memperlakukan setiap NULL sebagai berbeda pada indeks unik, jadi ribuan
-- baris tanpa nomor struk tetap sah berdampingan.
--
-- Gunanya satu: kasir di desa berjalan di atas jaringan putus-nyambung dan
-- akan mengirim ulang permintaan yang jawabannya tidak pernah sampai. Tanpa
-- kunci ini, satu penjualan memotong stok berkali-kali.
ALTER TABLE "InventoryTransaction" ADD COLUMN "externalRef" TEXT;

CREATE UNIQUE INDEX "InventoryTransaction_externalRef_key"
    ON "InventoryTransaction"("externalRef");

-- Umpan pemantauan menarik pergerakan terbaru lintas produk, bukan per
-- produk, jadi index gabungan yang sudah ada tidak terpakai untuk itu.
CREATE INDEX "InventoryTransaction_createdAt_idx"
    ON "InventoryTransaction"("createdAt");
