/**
 * Seed KATALOG PRODUK — aditif, idempoten, tidak pernah menghapus apa pun.
 *
 *     npm run seed:produk
 *
 * Yang dibuat ditentukan oleh JENIS tokonya, bukan namanya, sehingga Kopdes
 * atau mitra yang ditambahkan belakangan ikut terisi tanpa menyentuh berkas
 * ini:
 *
 *   - Kopdes          → barang ritel kebutuhan harian
 *   - Mitra KULINER   → makanan siap saji (warung makan)
 *   - Mitra MINUMAN   → kopi dan minuman (warkop)
 *   - Mitra SWALAYAN  → barang toko, daftar yang sama dengan ritel Kopdes
 *   - Mitra KERAJINAN → kerajinan tangan
 *
 * Kategori mitra JASA dan LAINNYA dilewati dengan catatan di layar: jasa
 * tidak punya stok, dan menebak barangnya hanya mengisi katalog dengan
 * dagangan yang tidak pernah ada.
 *
 * Kunci alami untuk idempotensi: nama kategori, `(kopdesId, sku)` untuk
 * barang Kopdes, dan `(umkmId, nama)` untuk barang mitra. Harga dan stok di
 * bawah adalah DATA CONTOH untuk pengembangan; foto tidak diisi karena URL
 * karangan hanya menghasilkan gambar rusak — kartu produk memakai penampung
 * bawaannya.
 */
import {
  CategoryGroup,
  PrismaClient,
  ProductUnit,
  UMKMCategory,
} from '@prisma/client';

const prisma = new PrismaClient();

// ── Kategori ──────────────────────────────────────────────────────────────
const KATEGORI: { name: string; group: CategoryGroup; description: string }[] =
  [
    {
      name: 'Sembako',
      group: CategoryGroup.RETAIL,
      description: 'Kebutuhan pokok dapur.',
    },
    {
      name: 'Minuman',
      group: CategoryGroup.RETAIL,
      description: 'Minuman kemasan.',
    },
    {
      name: 'Makanan Instan',
      group: CategoryGroup.RETAIL,
      description: 'Mi instan, bubur, dan sejenisnya.',
    },
    {
      name: 'Perawatan',
      group: CategoryGroup.RETAIL,
      description: 'Sabun, pasta gigi, dan perawatan diri.',
    },
    {
      name: 'Rumah Tangga',
      group: CategoryGroup.RETAIL,
      description: 'Deterjen, pembersih, dan perlengkapan rumah.',
    },
    {
      name: 'Makanan Siap Saji',
      group: CategoryGroup.FOOD,
      description: 'Masakan matang siap antar.',
    },
    { name: 'Kopi', group: CategoryGroup.FOOD, description: 'Kopi seduh.' },
    {
      name: 'Minuman Dingin',
      group: CategoryGroup.FOOD,
      description: 'Minuman dingin dan jus.',
    },
    {
      name: 'Camilan',
      group: CategoryGroup.FOOD,
      description: 'Gorengan, roti, dan kudapan.',
    },
    {
      name: 'Kerajinan',
      group: CategoryGroup.RETAIL,
      description: 'Kerajinan tangan warga.',
    },
  ];

// ── Barang ritel ──────────────────────────────────────────────────────────
type Varian = {
  name: string;
  price: number;
  stock: number;
  unit: ProductUnit;
};

type Ritel = {
  name: string;
  /** Akhiran SKU; awalannya dari desa Kopdes-nya. */
  kode: string;
  price: number;
  stock: number;
  unit: ProductUnit;
  kategori: string;
  deskripsi: string;
  discountPrice?: number;
  minStock?: number;
  isFeatured?: boolean;
  variants?: Varian[];
};

/**
 * Dipakai dua kali: sebagai barang Kopdes dan sebagai barang mitra
 * SWALAYAN. Satu daftar, karena yang dijual keduanya memang sama.
 */
const RITEL: Ritel[] = [
  {
    name: 'Beras Premium',
    kode: 'BRS',
    price: 72000,
    stock: 80,
    unit: ProductUnit.KARUNG,
    kategori: 'Sembako',
    deskripsi: 'Beras putih pulen, kemasan karung.',
    minStock: 15,
    isFeatured: true,
    variants: [
      { name: '5 kg', price: 72000, stock: 80, unit: ProductUnit.KARUNG },
      { name: '10 kg', price: 139000, stock: 40, unit: ProductUnit.KARUNG },
      { name: '25 kg', price: 335000, stock: 12, unit: ProductUnit.KARUNG },
    ],
  },
  {
    name: 'Gula Pasir',
    kode: 'GLA',
    price: 17000,
    stock: 120,
    unit: ProductUnit.KILOGRAM,
    kategori: 'Sembako',
    deskripsi: 'Gula pasir putih per kilogram.',
    minStock: 20,
  },
  {
    name: 'Minyak Goreng 2 Liter',
    kode: 'MYK',
    price: 38000,
    stock: 90,
    unit: ProductUnit.LITER,
    kategori: 'Sembako',
    deskripsi: 'Minyak goreng kemasan pouch 2 liter.',
    discountPrice: 35500,
    minStock: 18,
    isFeatured: true,
  },
  {
    name: 'Tepung Terigu Serbaguna',
    kode: 'TPG',
    price: 13000,
    stock: 70,
    unit: ProductUnit.KILOGRAM,
    kategori: 'Sembako',
    deskripsi: 'Tepung terigu protein sedang, 1 kg.',
  },
  {
    name: 'Telur Ayam Negeri',
    kode: 'TLR',
    price: 29000,
    stock: 60,
    unit: ProductUnit.KILOGRAM,
    kategori: 'Sembako',
    deskripsi: 'Telur ayam segar, dijual per kilogram.',
    minStock: 10,
  },
  {
    name: 'Garam Beryodium 250 g',
    kode: 'GRM',
    price: 4000,
    stock: 150,
    unit: ProductUnit.PACK,
    kategori: 'Sembako',
    deskripsi: 'Garam halus beryodium.',
  },
  {
    name: 'Mie Instan Goreng',
    kode: 'MIE',
    price: 3500,
    stock: 300,
    unit: ProductUnit.PCS,
    kategori: 'Makanan Instan',
    deskripsi: 'Mi instan rasa goreng, per bungkus.',
    minStock: 40,
    variants: [
      { name: 'Per bungkus', price: 3500, stock: 300, unit: ProductUnit.PCS },
      {
        name: 'Renteng isi 10',
        price: 33000,
        stock: 30,
        unit: ProductUnit.RENTENG,
      },
      { name: 'Dus isi 40', price: 128000, stock: 8, unit: ProductUnit.DUS },
    ],
  },
  {
    name: 'Kopi Sachet Renteng',
    kode: 'KOP',
    price: 12000,
    stock: 80,
    unit: ProductUnit.RENTENG,
    kategori: 'Makanan Instan',
    deskripsi: 'Kopi instan sachet, renteng isi 10.',
  },
  {
    name: 'Teh Celup 25 Kantong',
    kode: 'TEH',
    price: 9500,
    stock: 85,
    unit: ProductUnit.BOX,
    kategori: 'Minuman',
    deskripsi: 'Teh hitam celup, satu kotak isi 25.',
  },
  {
    name: 'Air Mineral 1,5 Liter',
    kode: 'AIR',
    price: 6000,
    stock: 200,
    unit: ProductUnit.BOTOL,
    kategori: 'Minuman',
    deskripsi: 'Air mineral kemasan botol besar.',
    minStock: 30,
  },
  {
    name: 'Susu Kental Manis 370 g',
    kode: 'SKM',
    price: 13500,
    stock: 75,
    unit: ProductUnit.KALENG,
    kategori: 'Minuman',
    deskripsi: 'Susu kental manis kaleng.',
  },
  {
    name: 'Sabun Mandi Batang',
    kode: 'SBN',
    price: 4500,
    stock: 160,
    unit: ProductUnit.PCS,
    kategori: 'Perawatan',
    deskripsi: 'Sabun mandi batang wangi.',
  },
  {
    name: 'Pasta Gigi 190 g',
    kode: 'PST',
    price: 17000,
    stock: 95,
    unit: ProductUnit.PCS,
    kategori: 'Perawatan',
    deskripsi: 'Pasta gigi keluarga.',
  },
  {
    name: 'Minyak Kayu Putih 60 ml',
    kode: 'MKP',
    price: 21000,
    stock: 55,
    unit: ProductUnit.BOTOL,
    kategori: 'Perawatan',
    deskripsi: 'Minyak kayu putih, botol 60 ml.',
  },
  {
    name: 'Deterjen Bubuk 800 g',
    kode: 'DTJ',
    price: 18500,
    stock: 70,
    unit: ProductUnit.PACK,
    kategori: 'Rumah Tangga',
    deskripsi: 'Deterjen bubuk untuk cuci tangan dan mesin.',
    discountPrice: 17000,
  },
];

// ── Barang mitra, per JENIS usaha ─────────────────────────────────────────
type BarangMitra = {
  name: string;
  price: number;
  stock: number;
  kategori: string;
  deskripsi: string;
  isFeatured?: boolean;
};

const KULINER: BarangMitra[] = [
  {
    name: 'Nasi Gurih Ayam Tangkap',
    price: 25000,
    stock: 30,
    kategori: 'Makanan Siap Saji',
    deskripsi: 'Nasi gurih dengan ayam tangkap dan daun temurui.',
    isFeatured: true,
  },
  {
    name: 'Mie Aceh Goreng Daging',
    price: 22000,
    stock: 35,
    kategori: 'Makanan Siap Saji',
    deskripsi: 'Mi Aceh goreng dengan irisan daging dan acar.',
    isFeatured: true,
  },
  {
    name: 'Ayam Penyet Sambal Ijo',
    price: 20000,
    stock: 30,
    kategori: 'Makanan Siap Saji',
    deskripsi: 'Ayam goreng penyet dengan sambal hijau.',
  },
  {
    name: 'Sate Matang 10 Tusuk',
    price: 30000,
    stock: 20,
    kategori: 'Makanan Siap Saji',
    deskripsi: 'Sate daging khas Matang dengan kuah soto.',
  },
  {
    name: 'Ikan Tongkol Balado',
    price: 15000,
    stock: 25,
    kategori: 'Makanan Siap Saji',
    deskripsi: 'Tongkol bumbu balado pedas.',
  },
  {
    name: 'Sayur Pliek U',
    price: 10000,
    stock: 25,
    kategori: 'Makanan Siap Saji',
    deskripsi: 'Kuah pliek u berisi sayuran kampung.',
  },
  {
    name: 'Tahu Tempe Goreng',
    price: 6000,
    stock: 40,
    kategori: 'Camilan',
    deskripsi: 'Tahu dan tempe goreng, lima potong.',
  },
  {
    name: 'Es Teh Manis',
    price: 5000,
    stock: 60,
    kategori: 'Minuman Dingin',
    deskripsi: 'Teh manis dingin, gelas besar.',
  },
];

const MINUMAN: BarangMitra[] = [
  {
    name: 'Kopi Sanger Dingin',
    price: 15000,
    stock: 50,
    kategori: 'Minuman Dingin',
    deskripsi: 'Sanger khas Aceh disajikan dingin.',
    isFeatured: true,
  },
  {
    name: 'Kopi Sanger Panas',
    price: 13000,
    stock: 50,
    kategori: 'Kopi',
    deskripsi: 'Sanger panas, racikan kopi dan susu kental.',
  },
  {
    name: 'Kopi Hitam Gayo Saring',
    price: 10000,
    stock: 60,
    kategori: 'Kopi',
    deskripsi: 'Kopi hitam saring biji Gayo.',
    isFeatured: true,
  },
  {
    name: 'Espresso Gayo',
    price: 18000,
    stock: 40,
    kategori: 'Kopi',
    deskripsi: 'Espresso single shot biji Gayo.',
  },
  {
    name: 'Teh Tarik',
    price: 12000,
    stock: 45,
    kategori: 'Minuman Dingin',
    deskripsi: 'Teh susu tarik, panas atau dingin.',
  },
  {
    name: 'Jus Alpukat Kopi',
    price: 20000,
    stock: 30,
    kategori: 'Minuman Dingin',
    deskripsi: 'Jus alpukat dengan shot kopi.',
  },
  {
    name: 'Biji Kopi Gayo Arabika 200 g',
    price: 70000,
    stock: 25,
    kategori: 'Kopi',
    deskripsi: 'Biji kopi arabika Gayo, sangrai medium.',
  },
  {
    name: 'Roti Bakar Srikaya',
    price: 15000,
    stock: 30,
    kategori: 'Camilan',
    deskripsi: 'Roti bakar isi srikaya, teman ngopi.',
  },
];

const KERAJINAN: BarangMitra[] = [
  {
    name: 'Tas Rajut Tangan',
    price: 95000,
    stock: 12,
    kategori: 'Kerajinan',
    deskripsi: 'Tas rajut buatan tangan, motif pilihan.',
  },
  {
    name: 'Bordir Kasab Mini',
    price: 150000,
    stock: 8,
    kategori: 'Kerajinan',
    deskripsi: 'Hiasan dinding bordir kasab khas Aceh.',
  },
  {
    name: 'Anyaman Tikar Pandan',
    price: 120000,
    stock: 10,
    kategori: 'Kerajinan',
    deskripsi: 'Tikar pandan anyaman warga.',
  },
];

/** Barang ritel dipakai ulang sebagai barang toko mitra swalayan. */
const SWALAYAN: BarangMitra[] = RITEL.map((r) => ({
  name: r.name,
  price: r.price,
  stock: r.stock,
  kategori: r.kategori,
  deskripsi: r.deskripsi,
  isFeatured: r.isFeatured,
}));

const PRODUK_MITRA: Partial<Record<UMKMCategory, BarangMitra[]>> = {
  [UMKMCategory.KULINER]: KULINER,
  [UMKMCategory.MINUMAN]: MINUMAN,
  [UMKMCategory.SWALAYAN]: SWALAYAN,
  [UMKMCategory.KERAJINAN]: KERAJINAN,
};

// ── Jalankan ──────────────────────────────────────────────────────────────

/**
 * Awalan SKU dari nama desa: tiga huruf pertama, huruf besar.
 *
 * Deterministik supaya menjalankan ulang menemukan barang yang sama, dan
 * cukup berbeda dari awalan buatan tangan di `seed-banda-aceh.ts` sehingga
 * tidak menimpa SKU yang sudah dipakai di sana.
 */
function awalanSku(village: string, fallback: string): string {
  const bersih = (village || fallback).replace(/[^A-Za-z]/g, '');
  return (bersih.slice(0, 3) || 'KPD').toUpperCase();
}

async function main() {
  let kategoriBaru = 0;
  const idKategori = new Map<string, string>();

  for (const k of KATEGORI) {
    const ada = await prisma.category.findFirst({ where: { name: k.name } });
    if (ada) {
      idKategori.set(k.name, ada.id);
      continue;
    }
    const dibuat = await prisma.category.create({ data: k });
    idKategori.set(k.name, dibuat.id);
    kategoriBaru += 1;
  }
  console.log(`Kategori: ${kategoriBaru} baru, ${idKategori.size} siap pakai`);

  function kategoriId(nama: string): string {
    const id = idKategori.get(nama);
    if (!id) throw new Error(`Kategori "${nama}" tidak ada di daftar KATEGORI`);
    return id;
  }

  // ── Kopdes: barang ritel ────────────────────────────────────────────────
  const semuaKopdes = await prisma.koperasi.findMany({
    select: { id: true, name: true, village: true },
    orderBy: { name: 'asc' },
  });
  if (semuaKopdes.length === 0) {
    console.log('Tidak ada Kopdes di basis data — barang ritel dilewati.');
  }

  for (const kopdes of semuaKopdes) {
    const awalan = awalanSku(kopdes.village, kopdes.name);
    let baru = 0;
    let varianBaru = 0;

    for (const r of RITEL) {
      const sku = `${awalan}-${r.kode}-01`;
      const ada = await prisma.product.findFirst({
        where: { kopdesId: kopdes.id, sku },
        select: { id: true },
      });
      if (ada) continue;

      const produk = await prisma.product.create({
        data: {
          name: r.name,
          description: r.deskripsi,
          price: r.price,
          stock: r.stock,
          categoryId: kategoriId(r.kategori),
          kopdesId: kopdes.id,
          unit: r.unit,
          sku,
          minStock: r.minStock ?? 5,
          discountPrice: r.discountPrice ?? null,
          isFeatured: r.isFeatured ?? false,
          isActive: true,
        },
      });
      baru += 1;

      for (const [i, v] of (r.variants ?? []).entries()) {
        await prisma.productVariant.create({
          data: {
            productId: produk.id,
            name: v.name,
            sku: `${sku}-V${i + 1}`,
            price: v.price,
            stock: v.stock,
            unit: v.unit,
            sortOrder: i,
          },
        });
        varianBaru += 1;
      }
    }

    console.log(
      `${kopdes.name} [${awalan}]: ${baru} barang ritel baru, ${varianBaru} varian`,
    );
  }

  // ── Mitra UMKM: sesuai jenis usahanya ───────────────────────────────────
  const semuaMitra = await prisma.uMKM.findMany({
    select: { id: true, businessName: true, category: true },
    orderBy: { businessName: 'asc' },
  });
  if (semuaMitra.length === 0) {
    console.log('Tidak ada mitra UMKM di basis data — barang mitra dilewati.');
  }

  for (const mitra of semuaMitra) {
    const daftar = PRODUK_MITRA[mitra.category];
    if (!daftar) {
      console.log(
        `${mitra.businessName} [${mitra.category}]: dilewati — belum ada ` +
          'daftar barang untuk jenis usaha ini',
      );
      continue;
    }

    let baru = 0;
    for (const b of daftar) {
      const ada = await prisma.uMKMProduct.findFirst({
        where: { umkmId: mitra.id, name: b.name },
        select: { id: true },
      });
      if (ada) continue;

      await prisma.uMKMProduct.create({
        data: {
          umkmId: mitra.id,
          name: b.name,
          description: b.deskripsi,
          price: b.price,
          stock: b.stock,
          categoryId: kategoriId(b.kategori),
          // Mitra sudah diverifikasi pengurus saat menjadi mitra, jadi
          // barangnya langsung tampil — sama seperti jalur unggah di
          // aplikasi (`SellerService.createProduct`).
          isApproved: true,
          isActive: true,
          isFeatured: b.isFeatured ?? false,
        },
      });
      baru += 1;
    }

    console.log(
      `${mitra.businessName} [${mitra.category}]: ${baru} barang baru`,
    );
  }

  const [totalProduk, totalMitraProduk] = await Promise.all([
    prisma.product.count(),
    prisma.uMKMProduct.count(),
  ]);
  console.log(
    `\nSelesai. Total sekarang: ${totalProduk} barang Kopdes, ` +
      `${totalMitraProduk} barang mitra.`,
  );
}

main()
  .catch((e) => {
    console.error('Seed gagal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
