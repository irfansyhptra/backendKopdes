-- Halaman informasi yang isinya dikelola dari backend.
--
-- Khusus materi keanggotaan koperasi: syarat, kewajiban, dan mekanisme
-- simpanan mengikuti AD/ART dan hanya boleh diisi pengurus koperasi, bukan
-- ditulis pengembang di dalam widget.

-- CreateTable
CREATE TABLE "ContentPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "footnote" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentPage_slug_key" ON "ContentPage"("slug");

-- CreateIndex
CREATE INDEX "ContentPage_isPublished_idx" ON "ContentPage"("isPublished");

