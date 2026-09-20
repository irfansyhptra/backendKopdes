/**
 * Seed ADITIF untuk data geo Kopdes & Mitra UMKM.
 *
 * Berbeda dari `SeedService.seed()` yang menghapus seluruh tabel lebih dulu:
 * skrip ini **tidak pernah menghapus apa pun**. Aman dijalankan berulang, dan
 * aman dijalankan pada database yang sudah berisi data nyata.
 *
 *     npx ts-node prisma/seed-umkm-geo.ts
 *
 * CATATAN: koordinat, foto, jam buka, dan ulasan di bawah adalah DATA CONTOH
 * untuk pengembangan. Ganti dengan data nyata lewat form Admin Kopdes di
 * `/admin/umkm-locations` sebelum dipakai pengguna sungguhan.
 */
import { PrismaClient, Role, UMKMCategory, UMKMStatus } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

/** Sama dengan PasswordHelper.hash di modul auth. */
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, 'sha512')
    .toString('hex');
  return `${salt}:${hash}`;
}

/** Pusat Desa Lamteh, Ulee Kareng, Banda Aceh. */
const LAMTEH = { latitude: 5.5483, longitude: 95.3441 };

/** Menggeser koordinat sejauh [meters] pada arah [bearingDeg]. */
function offset(meters: number, bearingDeg: number) {
  const latPerMeter = 1 / 111_320;
  const lngPerMeter =
    1 / (111_320 * Math.cos((LAMTEH.latitude * Math.PI) / 180));
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    latitude: Number(
      (LAMTEH.latitude + Math.cos(rad) * meters * latPerMeter).toFixed(6),
    ),
    longitude: Number(
      (LAMTEH.longitude + Math.sin(rad) * meters * lngPerMeter).toFixed(6),
    ),
  };
}

const JAM_HARIAN = {
  mon: { open: '07:00', close: '21:00' },
  tue: { open: '07:00', close: '21:00' },
  wed: { open: '07:00', close: '21:00' },
  thu: { open: '07:00', close: '21:00' },
  fri: { open: '07:00', close: '21:00' },
  sat: { open: '07:00', close: '21:00' },
  sun: { open: '08:00', close: '18:00' },
};

const JAM_KULINER = {
  ...JAM_HARIAN,
  mon: { open: '06:30', close: '20:00' },
  sun: null,
};

/** Mitra contoh, jaraknya mengikuti spesifikasi beranda. */
const MITRA_BARU = [
  {
    email: 'dapurkaknur@kopdes.test',
    ownerName: 'Nurhayati',
    businessName: 'Dapur Kak Nur',
    description: 'Masakan Aceh & Kue Tradisional',
    category: UMKMCategory.KULINER,
    ...offset(650, 35),
    operatingHours: JAM_KULINER,
    produk: [
      { name: 'Kue Adee', price: 25000, stock: 40 },
      { name: 'Ayam Tangkap', price: 45000, stock: 15 },
    ],
    ulasan: [5, 5, 5, 4],
  },
  {
    email: 'swalayanbarokah@kopdes.test',
    ownerName: 'Muhammad Rizki',
    businessName: 'Swalayan Barokah',
    description: 'Kebutuhan Harian',
    category: UMKMCategory.SWALAYAN,
    ...offset(1200, 140),
    operatingHours: JAM_HARIAN,
    produk: [
      { name: 'Beras Premium 5kg', price: 72000, stock: 60 },
      { name: 'Minyak Goreng 2L', price: 38000, stock: 80 },
    ],
    ulasan: [5, 5, 4, 5],
  },
  {
    email: 'kopilamteh@kopdes.test',
    ownerName: 'Teuku Iskandar',
    businessName: 'Kopi Lamteh',
    description: 'Kopi Aceh & Minuman',
    category: UMKMCategory.MINUMAN,
    ...offset(1500, 250),
    operatingHours: JAM_HARIAN,
    produk: [
      { name: 'Kopi Arabika Gayo 250g', price: 65000, stock: 35 },
      { name: 'Kopi Sanger Botol', price: 18000, stock: 50 },
    ],
    ulasan: [5, 4, 5, 4],
  },
];

/** Melengkapi tiga UMKM lama yang terdaftar sebelum kolom koordinat ada. */
const MITRA_LAMA: Record<string, { category: UMKMCategory; jarak: number; arah: number }> = {
  'UMKM Jaya Abadi': { category: UMKMCategory.SWALAYAN, jarak: 900, arah: 80 },
  'Warung Sari Rasa': { category: UMKMCategory.KULINER, jarak: 1800, arah: 190 },
  'Kerajinan Bambu Nusantara': {
    category: UMKMCategory.KERAJINAN,
    jarak: 2400,
    arah: 310,
  },
};

async function main() {
  const kopdes = await prisma.koperasi.findFirst({ where: { village: 'Lamteh' } });
  if (!kopdes) {
    throw new Error(
      'Kopdes Lamteh belum ada. Jalankan migration & seed Kopdes lebih dulu.',
    );
  }

  // ── 1. Lengkapi UMKM lama ──
  for (const [businessName, cfg] of Object.entries(MITRA_LAMA)) {
    const umkm = await prisma.uMKM.findFirst({ where: { businessName } });
    if (!umkm) continue;
    if (umkm.latitude !== null && umkm.longitude !== null) {
      console.log(`· ${businessName} sudah punya koordinat, dilewati`);
      continue;
    }
    const coords = offset(cfg.jarak, cfg.arah);
    await prisma.uMKM.update({
      where: { id: umkm.id },
      data: {
        ...coords,
        category: cfg.category,
        operatingHours: JAM_HARIAN,
        status: UMKMStatus.ACTIVE,
        kopdesId: kopdes.id,
      },
    });
    console.log(`✓ ${businessName} dilengkapi (${cfg.jarak} m)`);
  }

  // ── 2. Mitra contoh sesuai spesifikasi beranda ──
  const kategoriDefault = await prisma.category.findFirst();

  for (const m of MITRA_BARU) {
    let umkm = await prisma.uMKM.findFirst({
      where: { businessName: m.businessName },
    });

    if (!umkm) {
      const user = await prisma.user.upsert({
        where: { email: m.email },
        create: {
          email: m.email,
          password: hashPassword('Kopdes123!'),
          name: m.ownerName,
          role: Role.UMKM,
        },
        update: {},
      });

      umkm = await prisma.uMKM.create({
        data: {
          userId: user.id,
          businessName: m.businessName,
          description: m.description,
          address: `Desa Lamteh, Ulee Kareng, Banda Aceh`,
          phone: '08116700000',
          status: UMKMStatus.ACTIVE,
          verifiedAt: new Date(),
          category: m.category,
          latitude: m.latitude,
          longitude: m.longitude,
          operatingHours: m.operatingHours,
          kopdesId: kopdes.id,
        },
      });
      console.log(`✓ ${m.businessName} dibuat`);
    } else {
      console.log(`· ${m.businessName} sudah ada, dilewati`);
    }

    // Produk mitra, supaya halaman detail tidak kosong.
    if (kategoriDefault) {
      for (const p of m.produk) {
        const ada = await prisma.uMKMProduct.findFirst({
          where: { umkmId: umkm.id, name: p.name },
        });
        if (ada) continue;
        await prisma.uMKMProduct.create({
          data: {
            umkmId: umkm.id,
            name: p.name,
            description: `${p.name} dari ${m.businessName}.`,
            price: p.price,
            stock: p.stock,
            categoryId: kategoriDefault.id,
            isApproved: true,
            isActive: true,
          },
        });
      }
    }
  }

  // ── 3. Ulasan, supaya rating punya isi ──
  //
  // Rating dihitung dari agregasi tabel Review — tidak ada kolom rating yang
  // ditulis manual. Jadi satu-satunya cara memberi rating pada seed adalah
  // membuat ulasan nyata dari pengguna nyata.
  const pelanggan = await prisma.user.findMany({
    where: { role: Role.CUSTOMER },
    take: 4,
    select: { id: true },
  });

  if (pelanggan.length === 0) {
    console.log('! Tidak ada user CUSTOMER; ulasan dilewati.');
  } else {
    for (const m of MITRA_BARU) {
      const umkm = await prisma.uMKM.findFirst({
        where: { businessName: m.businessName },
        select: { id: true },
      });
      if (!umkm) continue;

      for (const [i, rating] of m.ulasan.entries()) {
        const user = pelanggan[i % pelanggan.length];
        await prisma.review.upsert({
          where: { userId_umkmId: { userId: user.id, umkmId: umkm.id } },
          create: { umkmId: umkm.id, userId: user.id, rating },
          update: { rating },
        });
      }
    }

    // Ulasan untuk Kopdes juga.
    for (const [i, rating] of [5, 5, 4, 5].entries()) {
      const user = pelanggan[i % pelanggan.length];
      await prisma.review.upsert({
        where: { userId_koperasiId: { userId: user.id, koperasiId: kopdes.id } },
        create: { koperasiId: kopdes.id, userId: user.id, rating },
        update: { rating },
      });
    }
    console.log('✓ Ulasan dibuat');
  }

  // ── Ringkasan ──
  const total = await prisma.uMKM.count();
  const berkoordinat = await prisma.uMKM.count({
    where: { latitude: { not: null }, status: UMKMStatus.ACTIVE },
  });
  console.log(`\nMitra UMKM: ${berkoordinat}/${total} siap tampil di pencarian terdekat`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
