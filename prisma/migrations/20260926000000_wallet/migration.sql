-- Dompet saldo warga.
--
-- `Wallet.balance` adalah cache, bukan sumber kebenaran: nilainya selalu sama
-- dengan jumlah seluruh `WalletEntry`, dan hanya boleh diubah di dalam
-- transaksi yang sekaligus menulis entrinya.
--
-- `WalletEntry` bersifat tambah-saja. Koreksi dilakukan dengan entri lawan,
-- bukan dengan menimpa baris lama — tanpa itu selisih pembukuan tidak bisa
-- ditelusuri ke sebabnya.
CREATE TYPE "WalletEntryType" AS ENUM ('TOPUP', 'PAYMENT', 'REFUND', 'ADJUSTMENT');
CREATE TYPE "TopUpStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'FAILED');

CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- Saldo tidak pernah boleh negatif. Dijaga database, bukan hanya kode:
-- satu jalur yang lupa memeriksa sudah cukup untuk membuat uang dari udara.
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_balance_not_negative" CHECK ("balance" >= 0);

CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "type" "WalletEntryType" NOT NULL,
    "description" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- Webhook Midtrans bisa datang lebih dari sekali untuk transaksi yang sama;
-- tanpa kunci unik ini saldo bertambah dua kali.
CREATE UNIQUE INDEX "WalletEntry_idempotencyKey_key" ON "WalletEntry"("idempotencyKey");
CREATE INDEX "WalletEntry_walletId_createdAt_idx" ON "WalletEntry"("walletId", "createdAt");

CREATE TABLE "WalletTopUp" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "TopUpStatus" NOT NULL DEFAULT 'PENDING',
    "midtransOrderId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "transactionId" TEXT,
    "transactionStatus" TEXT,
    "fraudStatus" TEXT,
    "actions" JSONB,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WalletTopUp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletTopUp_midtransOrderId_key" ON "WalletTopUp"("midtransOrderId");
CREATE INDEX "WalletTopUp_walletId_createdAt_idx" ON "WalletTopUp"("walletId", "createdAt");
CREATE INDEX "WalletTopUp_status_idx" ON "WalletTopUp"("status");

ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTopUp" ADD CONSTRAINT "WalletTopUp_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
