ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'MIDTRANS';

ALTER TABLE "Payment"
ADD COLUMN "snapToken" TEXT,
ADD COLUMN "snapRedirectUrl" TEXT;

CREATE UNIQUE INDEX "Payment_snapToken_key" ON "Payment"("snapToken");

ALTER TABLE "WalletTopUp"
ADD COLUMN "snapToken" TEXT,
ADD COLUMN "snapRedirectUrl" TEXT;

CREATE UNIQUE INDEX "WalletTopUp_snapToken_key" ON "WalletTopUp"("snapToken");
