/**
 * Seed ADITIF untuk konten penemuan beranda: produk pilihan, banner promosi,
 * dan pesanan selesai agar "Produk Terlaris" punya data untuk diagregasi.
 *
 *     npm run seed:discovery
 *
 * Tidak pernah menghapus apa pun; aman dijalankan berulang.
 *
 * CATATAN: pesanan di bawah adalah TRANSAKSI CONTOH untuk pengembangan, dibuat
 * agar endpoint agregasi bisa diuji. Jangan jalankan pada database produksi
 * yang laporan penjualannya dipakai sungguhan.
 */
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  Role,
} from '@prisma/client';

const prisma = new PrismaClient();

/** Menandai pesanan buatan seed agar bisa dikenali & dibersihkan. */
const SEED_MARKER = 'SEED-DISCOVERY';

const BANNERS = [
  {
    badge: 'GRATIS ONGKIR',
    title: 'Pengiriman Cepat',
    highlight: 'Kurir Desa',
    description:
      'Pengantaran langsung ke rumah warga oleh armada resmi KMP Mitra.',
    ctaLabel: 'Pesan Sekarang',
    ctaRoute: '/products',
    sortOrder: 0,
  },
  {
    badge: 'PROMO ANGGOTA',
    title: 'Belanja Hemat',
    highlight: 'Minggu Ini',
    description: 'Diskon spesial untuk anggota KMP Mitra.',
    ctaLabel: 'Belanja Sekarang',
    ctaRoute: '/products',
    sortOrder: 1,
  },
  {
    badge: 'DUKUNG LOKAL',
    title: 'Belanja Lokal,',
    highlight: 'Desa Lebih Kuat',
    description: 'Setiap pembelian membantu Kopdes dan UMKM berkembang.',
    ctaLabel: 'Pelajari',
    ctaRoute: '/umkm',
    sortOrder: 2,
  },
];

async function main() {
  // ── 1. Banner ──
  for (const b of BANNERS) {
    const ada = await prisma.banner.findFirst({ where: { title: b.title } });
    if (ada) {
      console.log(`· Banner "${b.title}" sudah ada`);
      continue;
    }
    await prisma.banner.create({ data: b });
    console.log(`✓ Banner "${b.title}" dibuat`);
  }

  // ── 2. Produk UMKM pilihan ──
  const umkmProducts = await prisma.uMKMProduct.findMany({
    where: { isActive: true, isApproved: true },
    take: 6,
    select: { id: true, name: true },
  });

  if (umkmProducts.length === 0) {
    console.log('! Belum ada produk UMKM. Jalankan seed:geo lebih dulu.');
  } else {
    await prisma.uMKMProduct.updateMany({
      where: { id: { in: umkmProducts.map((p) => p.id) } },
      data: { isFeatured: true },
    });
    console.log(`✓ ${umkmProducts.length} produk UMKM ditandai pilihan`);
  }

  // Beberapa produk koperasi juga ditandai pilihan.
  const koperasiProducts = await prisma.product.findMany({
    where: { isActive: true },
    take: 4,
    select: { id: true },
  });
  await prisma.product.updateMany({
    where: { id: { in: koperasiProducts.map((p) => p.id) } },
    data: { isFeatured: true },
  });
  console.log(`✓ ${koperasiProducts.length} produk koperasi ditandai pilihan`);

  // ── 3. Pesanan selesai untuk agregasi Produk Terlaris ──
  //
  // Terlaris dihitung dari OrderItem pada pesanan berstatus sah — tidak ada
  // kolom "jumlah terjual" yang ditulis manual. Jadi satu-satunya cara
  // memberi data pada seed adalah membuat pesanan sungguhan.
  const existing = await prisma.order.count({
    where: { items: { some: {} } },
  });
  if (existing > 0) {
    console.log(`· Sudah ada ${existing} pesanan; pembuatan dilewati`);
  } else {
    const customer = await prisma.user.findFirst({
      where: { role: Role.CUSTOMER },
      select: { id: true },
    });
    if (!customer) {
      console.log('! Tidak ada user CUSTOMER; pesanan dilewati.');
    } else {
      let address = await prisma.address.findFirst({
        where: { userId: customer.id },
      });
      address ??= await prisma.address.create({
        data: {
          userId: customer.id,
          title: 'Rumah',
          recipientName: 'Pelanggan Uji',
          phone: '08116700001',
          street: 'Jl. Utama Desa Lamteh',
          city: 'Banda Aceh',
          state: 'Aceh',
          postalCode: '23117',
          isDefault: true,
        },
      });

      const produkKoperasi = await prisma.product.findMany({
        take: 5,
        select: { id: true, price: true },
      });
      const produkUmkm = await prisma.uMKMProduct.findMany({
        take: 4,
        select: { id: true, price: true },
      });

      // Jumlah terjual dibuat menurun agar peringkatnya jelas terlihat.
      const kuantitas = [48, 36, 27, 19, 12, 41, 33, 22, 15];
      let index = 0;

      for (const p of produkKoperasi) {
        const qty = kuantitas[index++] ?? 5;
        await prisma.order.create({
          data: {
            customerId: customer.id,
            deliveryAddressId: address.id,
            totalAmount: Number(p.price) * qty,
            status: OrderStatus.COMPLETED,
            paymentMethod: PaymentMethod.COD,
            paymentStatus: PaymentStatus.PAID,
            items: {
              create: [{ productId: p.id, quantity: qty, price: p.price }],
            },
          },
        });
      }

      for (const p of produkUmkm) {
        const qty = kuantitas[index++] ?? 5;
        await prisma.order.create({
          data: {
            customerId: customer.id,
            deliveryAddressId: address.id,
            totalAmount: Number(p.price) * qty,
            status: OrderStatus.COMPLETED,
            paymentMethod: PaymentMethod.QRIS,
            paymentStatus: PaymentStatus.PAID,
            items: {
              create: [{ umkmProductId: p.id, quantity: qty, price: p.price }],
            },
          },
        });
      }

      // Satu pesanan DIBATALKAN dengan kuantitas besar — kalau muncul di
      // daftar terlaris, berarti filter statusnya bocor.
      if (produkKoperasi.length > 0) {
        await prisma.order.create({
          data: {
            customerId: customer.id,
            deliveryAddressId: address.id,
            totalAmount: 0,
            status: OrderStatus.CANCELLED,
            paymentMethod: PaymentMethod.COD,
            paymentStatus: PaymentStatus.FAILED,
            items: {
              create: [
                {
                  productId: produkKoperasi[produkKoperasi.length - 1].id,
                  quantity: 9999,
                  price: produkKoperasi[produkKoperasi.length - 1].price,
                },
              ],
            },
          },
        });
        console.log(`✓ 1 pesanan CANCELLED (qty 9999) sebagai uji filter`);
      }

      console.log(
        `✓ ${produkKoperasi.length + produkUmkm.length} pesanan selesai dibuat`,
      );
    }
  }

  console.log(`\nBanner aktif: ${await prisma.banner.count({ where: { isActive: true } })}`);
  console.log(`Produk pilihan UMKM: ${await prisma.uMKMProduct.count({ where: { isFeatured: true } })}`);
  console.log(`Pesanan: ${await prisma.order.count()} (${SEED_MARKER})`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
