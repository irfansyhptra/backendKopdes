-- Pembayaran lewat Midtrans Core API.
--
-- Kolom ditambahkan ke tabel "Payment" yang sudah ada, bukan ke tabel baru:
-- satu pesanan hanya punya satu pembayaran (orderId unik), dan tabel kedua
-- akan menduplikasi status yang harus selalu sama.

-- Metode pembayaran baru. Enum PostgreSQL hanya bisa ditambah, tidak diubah,
-- jadi nilai lama (COD, QRIS) tetap valid dan data yang ada tidak tersentuh.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'GOPAY';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'SHOPEEPAY';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'BCA_VA';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'BNI_VA';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'BRI_VA';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PERMATA_VA';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'MANDIRI_BILL';
