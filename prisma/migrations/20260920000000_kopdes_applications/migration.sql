-- Pengajuan bergabung dari koperasi desa.
--
-- Formulirnya publik: koperasi yang belum punya akun tentu belum bisa login.
-- Tidak ada kolom kata sandi — kata sandi dibuat saat pengajuan disetujui,
-- ditampilkan sekali kepada Super Admin untuk diteruskan, lalu hanya
-- tersimpan sebagai hash di tabel "User".

CREATE TYPE "KopdesApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "KopdesApplication" (
  "id"           TEXT NOT NULL,
  "kopdesName"   TEXT NOT NULL,
  "description"  TEXT,
  "address"      TEXT NOT NULL,
  "village"      TEXT NOT NULL,
  "district"     TEXT NOT NULL,
  "city"         TEXT NOT NULL,
  "province"     TEXT NOT NULL,
  "postalCode"   TEXT,
  -- Koordinat opsional saat mengajukan; pengurus desa sering tidak tahu.
  -- Super Admin melengkapinya saat menyetujui.
  "latitude"     DOUBLE PRECISION,
  "longitude"    DOUBLE PRECISION,
  "contactName"  TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "notes"        TEXT,
  "status"       "KopdesApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNote"   TEXT,
  "reviewedAt"   TIMESTAMP(3),
  "reviewedBy"   TEXT,
  "kopdesId"     TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KopdesApplication_pkey" PRIMARY KEY ("id")
);

-- Satu pengajuan melahirkan paling banyak satu koperasi.
CREATE UNIQUE INDEX "KopdesApplication_kopdesId_key" ON "KopdesApplication"("kopdesId");

-- Kotak masuk Super Admin diurutkan status lalu tanggal.
CREATE INDEX "KopdesApplication_status_createdAt_idx" ON "KopdesApplication"("status", "createdAt");

-- Dipakai menolak pengajuan ganda dari pengurus yang sama.
CREATE INDEX "KopdesApplication_contactEmail_idx" ON "KopdesApplication"("contactEmail");

ALTER TABLE "KopdesApplication" ADD CONSTRAINT "KopdesApplication_kopdesId_fkey"
  FOREIGN KEY ("kopdesId") REFERENCES "Koperasi"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
