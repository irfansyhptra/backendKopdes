-- Keanggotaan warga pada sebuah Kopdes.
--
-- Alurnya mengikuti verifikasi Mitra UMKM: warga mengajukan lewat halaman
-- Kopdes, pengurus yang memutuskan. Tidak ada jalur "langsung aktif".
--
-- Tidak ada kolom NIK. Untuk koperasi desa, nama, telepon, dan alamat sudah
-- cukup bagi pengurus yang mengenal warganya, sementara menyimpan nomor
-- identitas nasional menambah kewajiban perlindungan data yang tidak
-- sebanding manfaatnya di sini.
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

CREATE TABLE "KopdesMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kopdesId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "note" TEXT,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KopdesMembership_pkey" PRIMARY KEY ("id")
);

-- Satu warga satu keanggotaan per koperasi: tombol "Daftar" yang tertekan
-- dua kali tidak boleh melahirkan dua pengajuan yang harus ditolak manual.
CREATE UNIQUE INDEX "KopdesMembership_userId_kopdesId_key"
    ON "KopdesMembership"("userId", "kopdesId");

-- Panel pengurus selalu menyaring per koperasi dan per status.
CREATE INDEX "KopdesMembership_kopdesId_status_idx"
    ON "KopdesMembership"("kopdesId", "status");

ALTER TABLE "KopdesMembership"
    ADD CONSTRAINT "KopdesMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KopdesMembership"
    ADD CONSTRAINT "KopdesMembership_kopdesId_fkey"
    FOREIGN KEY ("kopdesId") REFERENCES "Koperasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
