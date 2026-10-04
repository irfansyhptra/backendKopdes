-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED');

-- CreateTable
CREATE TABLE "UMKMBankAccount" (
    "id" TEXT NOT NULL,
    "umkmId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UMKMBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UMKMPayout" (
    "id" TEXT NOT NULL,
    "umkmId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processedById" TEXT,
    "transferRef" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "UMKMPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UMKMBankAccount_umkmId_key" ON "UMKMBankAccount"("umkmId");

-- CreateIndex
CREATE INDEX "UMKMPayout_umkmId_status_idx" ON "UMKMPayout"("umkmId", "status");

-- CreateIndex
CREATE INDEX "UMKMPayout_status_requestedAt_idx" ON "UMKMPayout"("status", "requestedAt");

-- AddForeignKey
ALTER TABLE "UMKMBankAccount" ADD CONSTRAINT "UMKMBankAccount_umkmId_fkey" FOREIGN KEY ("umkmId") REFERENCES "UMKM"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UMKMPayout" ADD CONSTRAINT "UMKMPayout_umkmId_fkey" FOREIGN KEY ("umkmId") REFERENCES "UMKM"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nominal pencairan selalu positif; dijaga di basis data, bukan hanya DTO.
ALTER TABLE "UMKMPayout" ADD CONSTRAINT "UMKMPayout_amount_positive" CHECK ("amount" > 0);
