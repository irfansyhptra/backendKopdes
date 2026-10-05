-- Pengajuan pembatalan pesanan oleh pemesan, diputus pemilik barang.
-- Semuanya nullable: pesanan lama tidak punya pengajuan apa pun.
ALTER TABLE "Order" ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "Order" ADD COLUMN "cancelDecidedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "cancelDecidedById" TEXT;
ALTER TABLE "Order" ADD COLUMN "cancelRejectReason" TEXT;

-- Toko membuka daftar "pengajuan menunggu" tiap kali halaman pesanan dibuka:
-- yang sudah diajukan tetapi belum diputus.
CREATE INDEX "Order_cancelRequestedAt_cancelDecidedAt_idx"
  ON "Order"("cancelRequestedAt", "cancelDecidedAt");
