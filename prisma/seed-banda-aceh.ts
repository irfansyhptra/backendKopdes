/**
 * Seed ADITIF untuk Kopdes & Mitra UMKM Banda Aceh.
 *
 * Tidak pernah menghapus apa pun dan aman dijalankan berulang: setiap entitas
 * dicari dulu berdasarkan kunci alaminya (email, nama Kopdes, nama usaha,
 * SKU), lalu dibuat hanya bila belum ada.
 *
 *     npm run seed:bandaaceh
 *
 * Koordinat Kopdes dan UMKM di bawah adalah titik nyata yang diberikan
 * pengelola. Harga, stok, dan jam buka adalah DATA CONTOH untuk pengembangan.
 */
import {
  CategoryGroup,
  PrismaClient,
  ProductUnit,
  Role,
  UMKMCategory,
  UMKMStatus,
} from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

/// Sama persis dengan PasswordHelper.hash di src/modules/auth/helpers.
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, 'sha512')
    .toString('hex');
  return `${salt}:${hash}`;
}

/// Satu kata sandi untuk semua akun contoh. Jelas-jelas kata sandi
/// pengembangan, bukan sesuatu yang terlihat seperti rahasia sungguhan.
const PASSWORD = 'Kopdes123!';

const JAM_TOKO = {
  mon: { open: '07:30', close: '21:00' },
  tue: { open: '07:30', close: '21:00' },
  wed: { open: '07:30', close: '21:00' },
  thu: { open: '07:30', close: '21:00' },
  fri: { open: '07:30', close: '12:00' },
  sat: { open: '07:30', close: '21:00' },
  sun: { open: '08:00', close: '18:00' },
};

const JAM_WARUNG = {
  ...JAM_TOKO,
  fri: { open: '07:00', close: '12:00' },
  sun: null,
};

// ── Kategori ──────────────────────────────────────────────────────────────
const KATEGORI = [
  { name: 'Sembako', group: CategoryGroup.RETAIL },
  { name: 'Minuman', group: CategoryGroup.RETAIL },
  { name: 'Makanan Instan', group: CategoryGroup.RETAIL },
  { name: 'Perawatan', group: CategoryGroup.RETAIL },
  { name: 'Makanan Siap Saji', group: CategoryGroup.FOOD },
  { name: 'Kopi', group: CategoryGroup.FOOD },
];

// ── Kopdes ────────────────────────────────────────────────────────────────
type ProdukSeed = {
  name: string;
  sku: string;
  price: number;
  stock: number;
  unit: ProductUnit;
  kategori: string;
  deskripsi: string;
  discountPrice?: number;
  variants?: {
    name: string;
    price: number;
    stock: number;
    unit: ProductUnit;
  }[];
};

type KopdesSeed = {
  name: string;
  village: string;
  district: string;
  latitude: number;
  longitude: number;
  description: string;
  serviceCategories: string[];
  admin: { email: string; name: string; phone: string };
  produk: ProdukSeed[];
};

const KOPDES: KopdesSeed[] = [
  {
    name: 'Kopdes Lamgugop',
    village: 'Lamgugop',
    district: 'Syiah Kuala',
    latitude: 5.5711910689254305,
    longitude: 95.3504053159607,
    description:
      'Koperasi Desa Lamgugop melayani kebutuhan harian warga dan menaungi ' +
      'UMKM mitra di sekitarnya.',
    serviceCategories: ['Sembako', 'Minuman', 'Perawatan'],
    admin: {
      email: 'kepala.lamgugop@kopdes.test',
      name: 'Teuku Zulfikar',
      phone: '081360000101',
    },
    produk: [
      {
        name: 'Beras Premium',
        sku: 'LGG-BRS-01',
        price: 72000,
        stock: 120,
        unit: ProductUnit.KARUNG,
        kategori: 'Sembako',
        deskripsi: 'Beras premium pulen, kemasan karung 5 kg.',
        discountPrice: 68000,
        variants: [
          { name: '5 kg', price: 72000, stock: 80, unit: ProductUnit.KARUNG },
          { name: '10 kg', price: 139000, stock: 40, unit: ProductUnit.KARUNG },
        ],
      },
      {
        name: 'Minyak Goreng',
        sku: 'LGG-MYK-01',
        price: 19500,
        stock: 200,
        unit: ProductUnit.LITER,
        kategori: 'Sembako',
        deskripsi: 'Minyak goreng kemasan pouch, isi 1 liter.',
      },
      {
        name: 'Gula Pasir',
        sku: 'LGG-GLA-01',
        price: 17000,
        stock: 150,
        unit: ProductUnit.KILOGRAM,
        kategori: 'Sembako',
        deskripsi: 'Gula pasir putih kemasan 1 kg.',
      },
      {
        name: 'Air Mineral Galon',
        sku: 'LGG-AIR-01',
        price: 21000,
        stock: 60,
        unit: ProductUnit.BOTOL,
        kategori: 'Minuman',
        deskripsi: 'Air mineral galon isi ulang 19 liter.',
      },
      {
        name: 'Sabun Mandi Batang',
        sku: 'LGG-SBN-01',
        price: 4500,
        stock: 180,
        unit: ProductUnit.PCS,
        kategori: 'Perawatan',
        deskripsi: 'Sabun mandi batang 75 gram.',
      },
    ],
  },
  {
    name: 'Kopdes Ulee Kareng',
    village: 'Ulee Kareng',
    district: 'Ulee Kareng',
    latitude: 5.555945406355713,
    longitude: 95.35956289583892,
    description:
      'Koperasi Desa Ulee Kareng, pusat belanja harian warga sekaligus ' +
      'operator marketplace desa.',
    serviceCategories: ['Sembako', 'Makanan Instan', 'Kopi'],
    admin: {
      email: 'kepala.uleekareng@kopdes.test',
      name: 'Cut Nurmala',
      phone: '081360000102',
    },
    produk: [
      {
        name: 'Kopi Bubuk Ulee Kareng',
        sku: 'ULK-KOP-01',
        price: 32000,
        stock: 90,
        unit: ProductUnit.PACK,
        kategori: 'Kopi',
        deskripsi: 'Kopi robusta bubuk khas Ulee Kareng, kemasan 250 gram.',
        variants: [
          { name: '250 gram', price: 32000, stock: 60, unit: ProductUnit.PACK },
          { name: '500 gram', price: 60000, stock: 30, unit: ProductUnit.PACK },
        ],
      },
      {
        name: 'Mi Instan Goreng',
        sku: 'ULK-MIE-01',
        price: 3500,
        stock: 400,
        unit: ProductUnit.PCS,
        kategori: 'Makanan Instan',
        deskripsi: 'Mi instan rasa goreng, satuan bungkus.',
      },
      {
        name: 'Telur Ayam',
        sku: 'ULK-TLR-01',
        price: 28000,
        stock: 70,
        unit: ProductUnit.KILOGRAM,
        kategori: 'Sembako',
        deskripsi: 'Telur ayam ras segar, dijual per kilogram.',
      },
      {
        name: 'Tepung Terigu',
        sku: 'ULK-TPG-01',
        price: 13000,
        stock: 110,
        unit: ProductUnit.KILOGRAM,
        kategori: 'Sembako',
        deskripsi: 'Tepung terigu serbaguna kemasan 1 kg.',
      },
    ],
  },
  {
    name: 'Kopdes Prada',
    village: 'Peurada',
    district: 'Syiah Kuala',
    latitude: 5.570114094281567,
    longitude: 95.34663263815094,
    description:
      'Koperasi Desa Peurada melayani warga sekitar kampus dan menaungi ' +
      'UMKM kuliner di desanya.',
    serviceCategories: ['Sembako', 'Minuman', 'Makanan Instan'],
    admin: {
      email: 'kepala.prada@kopdes.test',
      name: 'Rizky Maulana',
      phone: '081360000103',
    },
    produk: [
      {
        name: 'Beras Medium',
        sku: 'PRD-BRS-01',
        price: 62000,
        stock: 100,
        unit: ProductUnit.KARUNG,
        kategori: 'Sembako',
        deskripsi: 'Beras medium kemasan karung 5 kg.',
      },
      {
        name: 'Susu Kental Manis',
        sku: 'PRD-SKM-01',
        price: 12500,
        stock: 140,
        unit: ProductUnit.KALENG,
        kategori: 'Minuman',
        deskripsi: 'Susu kental manis kaleng 370 gram.',
      },
      {
        name: 'Teh Celup',
        sku: 'PRD-TEH-01',
        price: 8500,
        stock: 160,
        unit: ProductUnit.BOX,
        kategori: 'Minuman',
        deskripsi: 'Teh celup isi 25 kantong.',
      },
      {
        name: 'Bubur Instan',
        sku: 'PRD-BBR-01',
        price: 6000,
        stock: 120,
        unit: ProductUnit.SACHET,
        kategori: 'Makanan Instan',
        deskripsi: 'Bubur ayam instan sachet siap seduh.',
      },
    ],
  },
];

// ── Mitra UMKM ────────────────────────────────────────────────────────────
//
// `kopdes` diisi dengan Kopdes TERDEKAT dari koordinat masing-masing, dihitung
// dengan Haversine (lihat jarak di komentar). Aturan bisnisnya 1 desa = 1
// Kopdes, jadi kalau batas desa sebenarnya berbeda dari hasil hitungan jarak,
// ubah nilai `kopdes` di sini — bukan koordinatnya.
const MITRA = [
  {
    businessName: 'Warung Nasi Mami Yose',
    description: 'Nasi campur, lauk rumahan, dan sarapan pagi.',
    category: UMKMCategory.KULINER,
    latitude: 5.575118945033485,
    longitude: 95.34668617809909,
    kopdes: 'Kopdes Prada', // 557 m (Lamgugop 600 m)
    operatingHours: JAM_WARUNG,
    owner: {
      email: 'mamiyose@kopdes.test',
      name: 'Yose Rizal',
      phone: '081360000201',
    },
    produk: [
      {
        name: 'Nasi Campur Komplit',
        price: 20000,
        stock: 40,
        kategori: 'Makanan Siap Saji',
      },
      {
        name: 'Ayam Goreng Lengkuas',
        price: 15000,
        stock: 30,
        kategori: 'Makanan Siap Saji',
      },
      {
        name: 'Sayur Nangka',
        price: 8000,
        stock: 25,
        kategori: 'Makanan Siap Saji',
      },
    ],
  },
  {
    businessName: 'AR Kopi',
    description: 'Kopi Aceh seduh dan biji kopi Gayo.',
    category: UMKMCategory.MINUMAN,
    latitude: 5.570987491106707,
    longitude: 95.35632352053679,
    kopdes: 'Kopdes Lamgugop', // 655 m (Prada 1.077 m)
    operatingHours: JAM_TOKO,
    owner: {
      email: 'arkopi@kopdes.test',
      name: 'Azhar Ramadhan',
      phone: '081360000202',
    },
    produk: [
      { name: 'Kopi Sanger Panas', price: 12000, stock: 60, kategori: 'Kopi' },
      { name: 'Kopi Hitam Saring', price: 9000, stock: 60, kategori: 'Kopi' },
      {
        name: 'Biji Kopi Gayo 250g',
        price: 65000,
        stock: 35,
        kategori: 'Kopi',
      },
    ],
  },
  {
    businessName: 'Aceh Meutuah Swalayan',
    description: 'Swalayan kebutuhan harian warga.',
    category: UMKMCategory.SWALAYAN,
    latitude: 5.573786549329418,
    longitude: 95.35617939132989,
    kopdes: 'Kopdes Lamgugop', // 701 m (Prada 1.133 m)
    operatingHours: JAM_TOKO,
    owner: {
      email: 'acehmeutuah@kopdes.test',
      name: 'Said Fachrurrazi',
      phone: '081360000203',
    },
    produk: [
      {
        name: 'Deterjen Bubuk 800g',
        price: 18000,
        stock: 70,
        kategori: 'Perawatan',
      },
      { name: 'Roti Tawar', price: 15000, stock: 40, kategori: 'Sembako' },
      {
        name: 'Air Mineral 600ml',
        price: 3500,
        stock: 200,
        kategori: 'Minuman',
      },
    ],
  },
];

async function upsertUser(
  email: string,
  name: string,
  phone: string,
  role: Role,
  kopdesId?: string,
) {
  // Kata sandi TIDAK ditimpa saat baris sudah ada: menjalankan ulang seed
  // tidak boleh mengembalikan kata sandi yang sudah diganti pemiliknya.
  return prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      phone,
      role,
      kopdesId,
      password: hashPassword(PASSWORD),
    },
    update: { name, phone, role, kopdesId },
  });
}

async function main() {
  // ── 1. Kategori ──
  const kategoriByName = new Map<string, string>();
  for (const k of KATEGORI) {
    const row = await prisma.category.upsert({
      where: { name: k.name },
      create: { name: k.name, group: k.group },
      update: { group: k.group },
    });
    kategoriByName.set(k.name, row.id);
  }
  console.log(`✓ ${KATEGORI.length} kategori siap`);

  // ── 2. Super Admin ──
  const superAdmin = await upsertUser(
    'superadmin@kopdes.test',
    'Super Admin KMP Mitra',
    '081360000001',
    Role.SUPER_ADMIN,
  );
  console.log(`✓ Super Admin  ${superAdmin.email}`);

  // ── 3. Kopdes + kepala Kopdes + produk ──
  const kopdesByName = new Map<string, string>();
  for (const k of KOPDES) {
    let kopdes = await prisma.koperasi.findFirst({ where: { name: k.name } });
    if (!kopdes) {
      kopdes = await prisma.koperasi.create({
        data: {
          name: k.name,
          description: k.description,
          address: `Desa ${k.village}, Kec. ${k.district}, Banda Aceh`,
          village: k.village,
          district: k.district,
          city: 'Banda Aceh',
          province: 'Aceh',
          latitude: k.latitude,
          longitude: k.longitude,
          phone: k.admin.phone,
          operatingHours: JAM_TOKO,
          serviceCategories: k.serviceCategories,
          isActive: true,
          isVerified: true,
        },
      });
      console.log(`✓ ${k.name} dibuat`);
    } else {
      // Koordinat selalu disegarkan: inilah data yang diminta diperbaiki.
      kopdes = await prisma.koperasi.update({
        where: { id: kopdes.id },
        data: { latitude: k.latitude, longitude: k.longitude, isActive: true },
      });
      console.log(`· ${k.name} sudah ada, koordinat disegarkan`);
    }
    kopdesByName.set(k.name, kopdes.id);

    const admin = await upsertUser(
      k.admin.email,
      k.admin.name,
      k.admin.phone,
      Role.ADMIN_KOPDES,
      kopdes.id,
    );
    console.log(`  · kepala Kopdes  ${admin.email}`);

    for (const p of k.produk) {
      const categoryId = kategoriByName.get(p.kategori);
      if (!categoryId) throw new Error(`Kategori ${p.kategori} tidak ada`);

      let produk = await prisma.product.findFirst({
        where: { kopdesId: kopdes.id, sku: p.sku },
      });
      if (!produk) {
        produk = await prisma.product.create({
          data: {
            name: p.name,
            description: p.deskripsi,
            price: p.price,
            discountPrice: p.discountPrice ?? null,
            stock: p.stock,
            unit: p.unit,
            sku: p.sku,
            categoryId,
            kopdesId: kopdes.id,
            isActive: true,
          },
        });
      }

      for (const [i, v] of (p.variants ?? []).entries()) {
        const ada = await prisma.productVariant.findFirst({
          where: { productId: produk.id, name: v.name },
        });
        if (ada) continue;
        await prisma.productVariant.create({
          data: {
            productId: produk.id,
            name: v.name,
            sku: `${p.sku}-V${i + 1}`,
            price: v.price,
            stock: v.stock,
            unit: v.unit,
            sortOrder: i,
          },
        });
      }
    }
    console.log(`  · ${k.produk.length} produk siap`);
  }

  // ── 4. Mitra UMKM + kepala UMKM + produk ──
  for (const m of MITRA) {
    const kopdesId = kopdesByName.get(m.kopdes);
    if (!kopdesId) throw new Error(`${m.kopdes} tidak ada`);

    const owner = await upsertUser(
      m.owner.email,
      m.owner.name,
      m.owner.phone,
      Role.UMKM,
    );

    let umkm = await prisma.uMKM.findFirst({
      where: { businessName: m.businessName },
    });
    if (!umkm) {
      umkm = await prisma.uMKM.create({
        data: {
          userId: owner.id,
          businessName: m.businessName,
          description: m.description,
          address: `Kec. Syiah Kuala, Banda Aceh`,
          phone: m.owner.phone,
          status: UMKMStatus.ACTIVE,
          verifiedAt: new Date(),
          category: m.category,
          latitude: m.latitude,
          longitude: m.longitude,
          operatingHours: m.operatingHours,
          kopdesId,
        },
      });
      console.log(`✓ ${m.businessName} dibuat → ${m.kopdes}`);
    } else {
      umkm = await prisma.uMKM.update({
        where: { id: umkm.id },
        data: {
          latitude: m.latitude,
          longitude: m.longitude,
          status: UMKMStatus.ACTIVE,
          kopdesId,
        },
      });
      console.log(`· ${m.businessName} sudah ada, koordinat disegarkan`);
    }
    console.log(`  · kepala UMKM  ${owner.email}`);

    for (const p of m.produk) {
      const categoryId = kategoriByName.get(p.kategori);
      if (!categoryId) throw new Error(`Kategori ${p.kategori} tidak ada`);

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
          categoryId,
          isApproved: true,
          isActive: true,
        },
      });
    }
    console.log(`  · ${m.produk.length} produk siap`);
  }

  console.log(`\nKata sandi semua akun contoh: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
