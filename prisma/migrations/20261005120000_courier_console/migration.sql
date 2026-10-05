-- Titik rumah pembeli: dipakai kurir untuk peta dan jarak.
-- Nullable: alamat lama tidak punya titik, dan izin lokasi boleh ditolak.
ALTER TABLE "Address" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Address" ADD COLUMN "longitude" DOUBLE PRECISION;

-- Jejak waktu pengantaran untuk log kurir, dan posisi kurir saat menandai
-- barang diantar (sisi kurir dari dual-validation).
ALTER TABLE "Delivery" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "Delivery" ADD COLUMN "pickedUpAt" TIMESTAMP(3);
ALTER TABLE "Delivery" ADD COLUMN "deliveredLatitude" DOUBLE PRECISION;
ALTER TABLE "Delivery" ADD COLUMN "deliveredLongitude" DOUBLE PRECISION;

-- Kumpulan tugas terbuka dibaca kurir setiap kali halaman Tugas dibuka:
-- pengantaran tanpa kurir, diurutkan dari yang paling lama menunggu.
CREATE INDEX "Delivery_courierId_status_idx" ON "Delivery"("courierId", "status");
