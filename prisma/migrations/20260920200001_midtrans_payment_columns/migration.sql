-- Kolom Midtrans pada Payment, plus tabel jejak webhook.
--
-- Dipisah dari migrasi enum karena PostgreSQL menolak memakai nilai enum baru
-- di dalam transaksi yang sama dengan ALTER TYPE yang menambahkannya.

ALTER TABLE "Payment" ADD COLUMN "midtransOrderId"     TEXT;
ALTER TABLE "Payment" ADD COLUMN "midtransPaymentType" TEXT;
ALTER TABLE "Payment" ADD COLUMN "bank"                TEXT;
ALTER TABLE "Payment" ADD COLUMN "vaNumber"            TEXT;
ALTER TABLE "Payment" ADD COLUMN "qrCodeUrl"           TEXT;
ALTER TABLE "Payment" ADD COLUMN "deeplinkUrl"         TEXT;
ALTER TABLE "Payment" ADD COLUMN "transactionStatus"   TEXT;
ALTER TABLE "Payment" ADD COLUMN "fraudStatus"         TEXT;
ALTER TABLE "Payment" ADD COLUMN "expiryTime"          TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "rawResponse"         JSONB;

-- Midtrans menolak order_id yang dipakai ulang, jadi nilainya wajib unik di
-- sisi kita juga — kalau tidak, dua pesanan bisa menunjuk transaksi yang sama.
CREATE UNIQUE INDEX "Payment_midtransOrderId_key" ON "Payment"("midtransOrderId");
CREATE INDEX "Payment_status_idx"     ON "Payment"("status");
CREATE INDEX "Payment_expiryTime_idx" ON "Payment"("expiryTime");

CREATE TABLE "PaymentWebhookEvent" (
  "id"                TEXT NOT NULL,
  "paymentId"         TEXT,
  "midtransOrderId"   TEXT NOT NULL,
  "transactionId"     TEXT NOT NULL,
  "transactionStatus" TEXT NOT NULL,
  "fraudStatus"       TEXT,
  "statusCode"        TEXT NOT NULL,
  "grossAmount"       TEXT NOT NULL,
  "payload"           JSONB NOT NULL,
  "rejectedReason"    TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- Kunci idempotensi. Satu transaksi sah mengirim beberapa status berbeda
-- (pending lalu settlement), tetapi status yang sama tidak boleh diproses
-- dua kali — Midtrans mengirim ulang sampai dijawab 200.
CREATE UNIQUE INDEX "PaymentWebhookEvent_transactionId_transactionStatus_key"
  ON "PaymentWebhookEvent"("transactionId", "transactionStatus");

CREATE INDEX "PaymentWebhookEvent_midtransOrderId_idx" ON "PaymentWebhookEvent"("midtransOrderId");
CREATE INDEX "PaymentWebhookEvent_createdAt_idx"       ON "PaymentWebhookEvent"("createdAt");

ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
