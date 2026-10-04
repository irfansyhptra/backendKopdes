-- Halaman bantuan penjual, dirujuk menu Toko > Pusat bantuan (/info/bantuan-penjual).
-- Idempoten: bila pengurus sudah mengubah isinya, migrasi tidak menimpanya.
INSERT INTO "ContentPage" ("id", "slug", "title", "subtitle", "sections", "footnote", "isPublished", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'bantuan-penjual',
  'Bantuan Penjual',
  'Cara kerja saldo, pencairan, produk, dan stok di KOMIT.',
  '[{"heading": "Saldo tersedia, tertahan, dan pesanan berjalan", "body": "Saldo tersedia berasal dari pesanan yang sudah SELESAI, dikurangi fee Kopdes 5% dari nilai barang dan pencairan yang sudah Anda ajukan. Saldo tertahan adalah pesanan yang sudah dibayar pembeli tetapi belum selesai; saldo ini pindah ke tersedia setelah pembeli mengonfirmasi atau pengurus menandai pesanan selesai. Pesanan yang belum dibayar, misalnya COD yang belum diantar, belum dihitung sebagai saldo."}, {"heading": "Menarik saldo", "body": "Isi rekening pencairan lebih dulu di menu Toko > Rekening pencairan. Penarikan minimal Rp50.000 dan hanya bisa diajukan satu per satu: tunggu pengajuan sebelumnya diproses. Pengurus Kopdes mentransfer secara manual lalu mencatat nomor referensi transfernya; statusnya bisa Anda lihat di Riwayat. Bila ditolak, nominalnya kembali ke saldo tersedia beserta alasannya."}, {"heading": "Ongkos kirim", "body": "Ongkos kirim belum dihitung sebagai saldo toko karena pengantaran saat ini dilakukan kurir Kopdes."}, {"heading": "Menambah dan mengubah produk", "body": "Produk baru langsung tampil di marketplace desa setelah dikirim. Admin Kopdes dapat menurunkan produk yang melanggar aturan. Foto diunggah satu per satu; bila ada foto yang gagal, produk tetap tersimpan dan foto bisa diunggah ulang."}, {"heading": "Mengubah stok", "body": "Ubah stok lewat tombol Atur stok di daftar produk, dengan alasan perubahan. Setiap perubahan tercatat di riwayat pergerakan stok, termasuk penjualan dari kasir POS yang terhubung. Stok 5 atau kurang ditandai Menipis dan stok 0 ditandai Habis."}, {"heading": "Status toko", "body": "Toko baru tampil untuk pembeli setelah diverifikasi Admin Kopdes. Status Buka atau Tutup dihitung dari jam buka yang Anda isi di Pengaturan toko."}]'::jsonb,
  'Pertanyaan yang belum terjawab? Hubungi pengurus Kopdes desa Anda.',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;
