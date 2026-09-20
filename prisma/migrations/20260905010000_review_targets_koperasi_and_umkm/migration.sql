-- Review kini bisa menilai Kopdes dan Mitra UMKM, bukan hanya produk.
--
-- Rating pada card dihitung dari agregasi tabel ini; tidak ada kolom rating
-- yang ditulis manual, sehingga angkanya selalu berasal dari ulasan nyata.
-- Unique index memastikan satu pengguna hanya punya satu ulasan per sasaran;
-- Postgres memperbolehkan banyak NULL sehingga ulasan produk tidak terbatasi.

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "koperasiId" TEXT,
ADD COLUMN     "umkmId" TEXT;

-- CreateIndex
CREATE INDEX "Review_koperasiId_idx" ON "Review"("koperasiId");

-- CreateIndex
CREATE INDEX "Review_umkmId_idx" ON "Review"("umkmId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_koperasiId_key" ON "Review"("userId", "koperasiId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_umkmId_key" ON "Review"("userId", "umkmId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_koperasiId_fkey" FOREIGN KEY ("koperasiId") REFERENCES "Koperasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_umkmId_fkey" FOREIGN KEY ("umkmId") REFERENCES "UMKM"("id") ON DELETE CASCADE ON UPDATE CASCADE;

