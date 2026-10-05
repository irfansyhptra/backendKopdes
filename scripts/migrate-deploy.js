/**
 * `prisma migrate deploy` lewat koneksi LANGSUNG ke Postgres.
 *
 * DATABASE_URL produksi menunjuk pooler Neon (PgBouncer, mode transaksi).
 * Prisma Migrate memakai advisory lock tingkat sesi; lewat PgBouncer lock
 * itu tertinggal di koneksi server yang dipakai bergantian, dan migrasi
 * berikutnya menunggu lock yang tak pernah dilepas sampai timeout — deploy
 * gagal (4 Okt 2026).
 *
 * DIRECT_URL wajib diisi. Menebak alamat langsung dengan mengubah hostname
 * pooler berbahaya: pola host adalah detail penyedia dan dapat berubah tanpa
 * pemberitahuan. URL tidak pernah dicetak.
 */
const { execSync } = require('child_process');

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  throw new Error(
    'DIRECT_URL wajib diisi untuk migrasi. Build aplikasi tidak menjalankan migrasi otomatis.',
  );
}

const command = process.argv[2] === 'status' ? 'status' : 'deploy';
execSync(`npx prisma migrate ${command}`, {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: directUrl },
});
