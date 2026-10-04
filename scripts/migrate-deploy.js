/**
 * `prisma migrate deploy` lewat koneksi LANGSUNG ke Postgres.
 *
 * DATABASE_URL produksi menunjuk pooler Neon (PgBouncer, mode transaksi).
 * Prisma Migrate memakai advisory lock tingkat sesi; lewat PgBouncer lock
 * itu tertinggal di koneksi server yang dipakai bergantian, dan migrasi
 * berikutnya menunggu lock yang tak pernah dilepas sampai timeout — deploy
 * gagal (4 Okt 2026).
 *
 * Urutan: DIRECT_URL bila diisi, selain itu host yang sama tanpa
 * "-pooler" (pola nama host Neon). URL tidak pernah dicetak.
 */
const { execSync } = require('child_process');

function directUrl() {
  if (process.env.DIRECT_URL) return process.env.DIRECT_URL;
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL kosong');
  const url = new URL(raw);
  url.hostname = url.hostname.replace('-pooler.', '.');
  url.searchParams.delete('pgbouncer');
  return url.toString();
}

const command = process.argv[2] === 'status' ? 'status' : 'deploy';
execSync(`npx prisma migrate ${command}`, {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: directUrl() },
});
