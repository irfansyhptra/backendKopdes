-- Kurir menjadi milik satu Kopdes.
--
-- Kolom `kopdesId` sudah ada sejak 20260907000000, tapi pengisian otomatis
-- saat itu hanya menyentuh ADMIN_KOPDES dan PEGAWAI_KOPDES. Kurir dibiarkan
-- null, sehingga daftar kurir tampil sama untuk semua desa.
--
-- Sama seperti migrasi itu: hanya diisi bila persis satu Koperasi terdaftar.
-- Pada pemasangan multi-desa, menebak desa seorang kurir justru berbahaya —
-- ia akan tampil di panel koperasi yang bukan tempatnya bekerja, dan bisa
-- ditugasi mengantar pesanan desa lain.
UPDATE "User"
SET "kopdesId" = (SELECT "id" FROM "Koperasi" LIMIT 1)
WHERE "role" = 'COURIER'
  AND "kopdesId" IS NULL
  AND (SELECT COUNT(*) FROM "Koperasi") = 1;
