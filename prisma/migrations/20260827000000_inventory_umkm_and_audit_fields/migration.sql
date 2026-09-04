-- InventoryTransaction kini juga mencatat pergerakan stok produk UMKM.
-- Semua perubahan bersifat aditif: baris lama tetap valid (productId terisi,
-- umkmProductId/stockAfter/userId NULL).

-- AlterTable
ALTER TABLE "InventoryTransaction" ALTER COLUMN "productId" DROP NOT NULL;

ALTER TABLE "InventoryTransaction" ADD COLUMN "umkmProductId" TEXT;
ALTER TABLE "InventoryTransaction" ADD COLUMN "stockAfter" INTEGER;
ALTER TABLE "InventoryTransaction" ADD COLUMN "userId" TEXT;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_umkmProductId_fkey" FOREIGN KEY ("umkmProductId") REFERENCES "UMKMProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "InventoryTransaction_productId_createdAt_idx" ON "InventoryTransaction"("productId", "createdAt");

CREATE INDEX "InventoryTransaction_umkmProductId_createdAt_idx" ON "InventoryTransaction"("umkmProductId", "createdAt");
