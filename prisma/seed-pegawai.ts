/**
 * Seed ADITIF untuk akun Pegawai Kopdes.
 *
 *     npm run seed:pegawai
 *
 * Idempoten, dan tidak menghapus apa pun. Sengaja terpisah dari
 * `SeedService.seed()` (`POST /admin/seed`) yang mengosongkan seluruh tabel
 * lebih dulu — memakai skrip itu pada database yang sudah berisi pesanan
 * nyata akan membuang datanya.
 *
 * ══════════════════════════════════════════════════════════════════
 * Dua akun, karena keduanya menunjukkan hal yang berbeda.
 *
 * `pegawai@kopdes.co` memakai `permissions: []`, yang berarti "pakai bawaan
 * peran" (lihat `resolvePermissions` di src/common/permissions.ts) — bukan
 * "tanpa wewenang". Inilah pegawai biasa: seluruh delapan tile Akses Cepat
 * terbuka untuknya, karena semua izin yang dibutuhkan tile itu memang ada di
 * PEGAWAI_DEFAULTS. Bedanya dengan Admin Kopdes muncul di tempat lain —
 * tombol "Batalkan" pada pesanan dan buku besar keuangan.
 *
 * `pegawai2@kopdes.co` dipersempit lewat daftar override. Override hanya bisa
 * MENGURANGI: `resolvePermissions` menyaring bawaan peran terhadap daftar ini,
 * jadi menuliskan izin yang bukan milik pegawai tidak akan menaikkan
 * wewenangnya. Akun ini yang memperlihatkan tile terkunci.
 * ══════════════════════════════════════════════════════════════════
 */
import { PrismaClient, Role } from '@prisma/client';
import { PasswordHelper } from '../src/modules/auth/helpers/crypto.helper';

const prisma = new PrismaClient();

/** Sama dengan akun seed lain, supaya tidak ada kata sandi baru dihafal. */
const PASSWORD = 'password123';

const STAFF = [
  {
    email: 'pegawai@kopdes.co',
    name: 'Andi Pratama (Pegawai)',
    phone: '081200000004',
    /** Kosong = pakai bawaan peran. */
    permissions: [] as string[],
  },
  {
    email: 'pegawai2@kopdes.co',
    name: 'Dewi Lestari (Pegawai Kasir)',
    phone: '081200000005',
    /**
     * Pegawai kasir: melayani pesanan dan melihat stok, tanpa menyentuh
     * katalog, pengiriman, keuangan, maupun asisten AI. Empat dari delapan
     * tile akan tampil terkunci untuknya.
     */
    permissions: [
      'product:read',
      'order:read',
      'order:process',
      'inventory:read',
    ],
  },
];

async function main() {
  const kopdes = await prisma.koperasi.findFirst({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  // Tanpa Kopdes, `resolveScope` di StaffService menolak setiap permintaan
  // dashboard — pegawai tanpa penugasan tidak punya desa untuk dilayani.
  if (!kopdes) {
    throw new Error(
      'Belum ada Koperasi terdaftar. Buat satu lebih dulu sebelum menugaskan pegawai.',
    );
  }

  for (const staff of STAFF) {
    // Kata sandi di-hash ulang tiap kali dijalankan: salt-nya acak, jadi
    // menyamakan hash antar-jalankan tidak mungkin dan juga tidak perlu.
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      update: {
        name: staff.name,
        role: Role.PEGAWAI_KOPDES,
        kopdesId: kopdes.id,
        permissions: staff.permissions,
      },
      create: {
        email: staff.email,
        name: staff.name,
        phone: staff.phone,
        password: PasswordHelper.hash(PASSWORD),
        role: Role.PEGAWAI_KOPDES,
        kopdesId: kopdes.id,
        permissions: staff.permissions,
      },
      select: { email: true, name: true, permissions: true },
    });

    const scope =
      user.permissions.length === 0
        ? 'bawaan peran'
        : `dipersempit ke ${user.permissions.length} izin`;
    console.log(`✓ ${user.email.padEnd(22)} ${user.name}  (${scope})`);
  }

  console.log(`\nKopdes   : ${kopdes.name}`);
  console.log(`Kata sandi: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
