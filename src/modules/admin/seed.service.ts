import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PasswordHelper } from '../auth/helpers/crypto.helper';
import { OrderStatus } from '@prisma/client';


@Injectable()
export class SeedService {
  constructor(private readonly prisma: PrismaService) { }

  async seed() {
    // ═══════════════════════════════════════════════
    // 0. CLEANUP - Clear existing data in proper order
    // ═══════════════════════════════════════════════
    await this.prisma.communitySuggestionSupport.deleteMany();
    await this.prisma.communitySuggestion.deleteMany();
    await this.prisma.notification.deleteMany();
    await this.prisma.auditLog.deleteMany();
    await this.prisma.deliveryLocation.deleteMany();
    await this.prisma.delivery.deleteMany();
    await this.prisma.invoice.deleteMany();
    await this.prisma.payment.deleteMany();
    await this.prisma.orderItem.deleteMany();
    await this.prisma.order.deleteMany();
    await this.prisma.cartItem.deleteMany();
    await this.prisma.cart.deleteMany();
    await this.prisma.review.deleteMany();
    await this.prisma.inventoryTransaction.deleteMany();
    await this.prisma.productImage.deleteMany();
    await this.prisma.uMKMProduct.deleteMany();
    await this.prisma.product.deleteMany();
    await this.prisma.category.deleteMany();
    await this.prisma.address.deleteMany();
    await this.prisma.refreshToken.deleteMany();
    await this.prisma.uMKM.deleteMany();
    await this.prisma.user.deleteMany();

    // ═══════════════════════════════════════════════
    // 1. USERS - Create accounts for all 5 roles
    // ═══════════════════════════════════════════════
    // Default password for all seeded users: "password123"
    const defaultPassword = PasswordHelper.hash('password123');

    const usersData = [
      // SUPER_ADMIN
      {
        email: 'superadmin@kopdes.co',
        password: defaultPassword,
        name: 'Super Admin KOPDES',
        phone: '081200000001',
        role: 'SUPER_ADMIN' as const,
      },
      // ADMIN_KOPDES
      {
        email: 'admin@kopdes.co',
        password: defaultPassword,
        name: 'Admin Koperasi Desa',
        phone: '081200000002',
        role: 'ADMIN_KOPDES' as const,
      },
      {
        email: 'admin2@kopdes.co',
        password: defaultPassword,
        name: 'Siti Rahayu (Admin)',
        phone: '081200000003',
        role: 'ADMIN_KOPDES' as const,
      },
      // CUSTOMER
      {
        email: 'customer@kopdes.co',
        password: defaultPassword,
        name: 'Budi Santoso',
        phone: '081300000001',
        role: 'CUSTOMER' as const,
      },
      {
        email: 'customer2@kopdes.co',
        password: defaultPassword,
        name: 'Rina Wulandari',
        phone: '081300000002',
        role: 'CUSTOMER' as const,
      },
      {
        email: 'customer3@kopdes.co',
        password: defaultPassword,
        name: 'Ahmad Fauzi',
        phone: '081300000003',
        role: 'CUSTOMER' as const,
      },
      {
        email: 'customer4@kopdes.co',
        password: defaultPassword,
        name: 'Dewi Lestari',
        phone: '081300000004',
        role: 'CUSTOMER' as const,
      },
      {
        email: 'customer5@kopdes.co',
        password: defaultPassword,
        name: 'Joko Prasetyo',
        phone: '081300000005',
        role: 'CUSTOMER' as const,
      },
      // UMKM
      {
        email: 'umkm@kopdes.co',
        password: defaultPassword,
        name: 'Pak Harto (UMKM Jaya)',
        phone: '081400000001',
        role: 'UMKM' as const,
      },
      {
        email: 'umkm2@kopdes.co',
        password: defaultPassword,
        name: 'Bu Sari (Warung Sari)',
        phone: '081400000002',
        role: 'UMKM' as const,
      },
      {
        email: 'umkm3@kopdes.co',
        password: defaultPassword,
        name: 'Mas Roni (Kerajinan Bambu)',
        phone: '081400000003',
        role: 'UMKM' as const,
      },
      // COURIER
      {
        email: 'courier@kopdes.co',
        password: defaultPassword,
        name: 'Andi Kurniawan (Kurir)',
        phone: '081500000001',
        role: 'COURIER' as const,
      },
      {
        email: 'courier2@kopdes.co',
        password: defaultPassword,
        name: 'Dimas Prasetya (Kurir)',
        phone: '081500000002',
        role: 'COURIER' as const,
      },
      {
        email: 'pakbud@gmail.com',
        password: defaultPassword,
        name: 'Pak Budi (UMKM Mandiri)',
        phone: '081400000004',
        role: 'UMKM' as const,
      },
    ];

    const createdUsers: Record<string, any> = {};
    for (const userData of usersData) {
      const user = await this.prisma.user.create({ data: userData });
      createdUsers[user.email] = user;
    }

    // ═══════════════════════════════════════════════
    // 2. ADDRESSES - Create addresses for customers
    // ═══════════════════════════════════════════════
    const customerEmails = ['customer@kopdes.co', 'customer2@kopdes.co', 'customer3@kopdes.co', 'customer4@kopdes.co', 'customer5@kopdes.co'];
    for (const email of customerEmails) {
      const user = createdUsers[email];
      await this.prisma.address.create({
        data: {
          userId: user.id,
          title: 'Rumah Utama',
          recipientName: user.name,
          phone: user.phone,
          street: 'Jl. Merdeka No. ' + Math.floor(Math.random() * 100 + 1),
          city: 'Sleman',
          state: 'DI Yogyakarta',
          postalCode: '55281',
          isDefault: true,
        },
      });
    }

    // ═══════════════════════════════════════════════
    // 3. UMKM PROFILES - Create UMKM business profiles
    // ═══════════════════════════════════════════════
    const umkmProfiles = [
      {
        email: 'umkm@kopdes.co',
        businessName: 'UMKM Jaya Abadi',
        description: 'Produsen makanan olahan tradisional khas desa Sinduadi.',
        address: 'Jl. Koperasi No. 12, Sinduadi',
        phone: '081400000001',
        status: 'ACTIVE' as const,
      },
      {
        email: 'umkm2@kopdes.co',
        businessName: 'Warung Sari Rasa',
        description: 'Penjual bumbu dapur dan rempah-rempah asli pedesaan.',
        address: 'Jl. Pasar Desa No. 5, Sinduadi',
        phone: '081400000002',
        status: 'ACTIVE' as const,
      },
      {
        email: 'umkm3@kopdes.co',
        businessName: 'Kerajinan Bambu Nusantara',
        description: 'Perajin anyaman bambu untuk peralatan rumah tangga.',
        address: 'Jl. Pengrajin No. 8, Sinduadi',
        phone: '081400000003',
        status: 'ACTIVE' as const,
      },
    ];

    for (const profile of umkmProfiles) {
      const user = createdUsers[profile.email];
      await this.prisma.uMKM.create({
        data: {
          userId: user.id,
          businessName: profile.businessName,
          description: profile.description,
          address: profile.address,
          phone: profile.phone,
          status: profile.status,
          verifiedAt: new Date(),
        },
      });
    }

    // ═══════════════════════════════════════════════
    // 4. CATEGORIES - 10 categories
    // ═══════════════════════════════════════════════
    const categoriesData = [
      { name: 'Makanan', description: 'Makanan olahan khas desa, sehat dan bergizi' },
      { name: 'Minuman', description: 'Minuman khas desa dan kopi nusantara' },
      { name: 'Cemilan', description: 'Makanan ringan tradisional renyah' },
      { name: 'Bahan Pokok', description: 'Hasil tani utama: beras, minyak, gula' },
      { name: 'Kerajinan', description: 'Kerajinan tangan bambu, kayu, dan rajut' },
      { name: 'Peralatan Rumah', description: 'Alat-alat rumah tangga tradisional dan modern' },
      { name: 'Pakaian', description: 'Batik lokal dan kaos komunitas desa' },
      { name: 'Pertanian', description: 'Pupuk, benih tanaman unggul, dan sekop' },
      { name: 'Perikanan', description: 'Pakan ikan, jaring, dan hasil olahan laut/kolam' },
      { name: 'Kesehatan & Kecantikan', description: 'Jamuan herbal, sabun kelapa alami' },
    ];

    const categories = [];
    for (const cat of categoriesData) {
      const created = await this.prisma.category.create({ data: cat });
      categories.push(created);
    }

    const catMap = categories.reduce((acc, cat) => {
      acc[cat.name] = cat.id;
      return acc;
    }, {} as Record<string, string>);

    // ═══════════════════════════════════════════════
    // 5. PRODUCTS - 20 products across categories
    // ═══════════════════════════════════════════════
    const productsData = [
      { name: 'Madu Hutan Alami Lestari', description: 'Madu asli dari hutan liar Sinduadi. Dipanen alami dengan rasa manis murni.', price: 85000, stock: 25, categoryName: 'Makanan', images: ['https://picsum.photos/id/1080/400/300', 'https://picsum.photos/id/1081/400/300'] },
      { name: 'Gula Aren Organik Semut', description: 'Gula aren bubuk premium asli dari sadapan pohon kelapa lokal.', price: 18000, stock: 50, categoryName: 'Makanan', images: ['https://picsum.photos/id/1082/400/300'] },
      { name: 'Kopi Robusta Merapi Original', description: 'Biji kopi robusta lereng Gunung Merapi dengan roasting medium-dark.', price: 45000, stock: 35, categoryName: 'Minuman', images: ['https://picsum.photos/id/1060/400/300', 'https://picsum.photos/id/1061/400/300'] },
      { name: 'Teh Kelor Wangi Desa', description: 'Teh celup daun kelor kaya antioksidan dan baik untuk kebugaran tubuh.', price: 22000, stock: 40, categoryName: 'Minuman', images: ['https://picsum.photos/id/1062/400/300'] },
      { name: 'Keripik Tempe Sinduadi Premium', description: 'Keripik tempe tipis gurih renyah digoreng dengan minyak kelapa murni.', price: 15000, stock: 100, categoryName: 'Cemilan', images: ['https://picsum.photos/id/1070/400/300'] },
      { name: 'Sale Pisang Goreng Manis', description: 'Pisang sale olahan tradisional dibalur tepung renyah bergizi.', price: 12000, stock: 80, categoryName: 'Cemilan', images: ['https://picsum.photos/id/1071/400/300'] },
      { name: 'Beras Mentik Susu Organik 5kg', description: 'Beras mentik susu lokal organik tanpa bahan kimia pengawet.', price: 95000, stock: 15, categoryName: 'Bahan Pokok', images: ['https://picsum.photos/id/1050/400/300'] },
      { name: 'Minyak Kelapa Kampung Murni 1L', description: 'Minyak goreng kelapa tradisional hasil perasan kelapa segar pedesaan.', price: 32000, stock: 30, categoryName: 'Bahan Pokok', images: ['https://picsum.photos/id/1051/400/300'] },
      { name: 'Telur Ayam Kampung Asli 10 Butir', description: 'Telur ayam kampung segar kualitas premium hasil peternakan liar warga.', price: 28000, stock: 20, categoryName: 'Bahan Pokok', images: ['https://picsum.photos/id/1052/400/300'] },
      { name: 'Tas Anyaman Bambu Tradisional', description: 'Tas belanja anyaman bambu kokoh ramah lingkungan buatan perajin desa.', price: 35000, stock: 12, categoryName: 'Kerajinan', images: ['https://picsum.photos/id/1040/400/300'] },
      { name: 'Tatakan Piring Serat Eceng Gondok', description: 'Set isi 4 tatakan piring rajutan eceng gondok estetik.', price: 45000, stock: 18, categoryName: 'Kerajinan', images: ['https://picsum.photos/id/1041/400/300'] },
      { name: 'Sapu Ijuk Tangkai Kayu Mahoni', description: 'Sapu ijuk kokoh kualitas ekspor dengan gagang kayu halus merata.', price: 19000, stock: 50, categoryName: 'Peralatan Rumah', images: ['https://picsum.photos/id/1030/400/300'] },
      { name: 'Ulekan Batu Kali Lereng Gunung', description: 'Cobek dan ulekan batu kali asli, kokoh tidak mudah rontok saat dipakai.', price: 65000, stock: 8, categoryName: 'Peralatan Rumah', images: ['https://picsum.photos/id/1031/400/300'] },
      { name: 'Kemeja Batik Tulis Sinduadi', description: 'Kemeja batik katun halus dengan motif tulis tradisional khas dusun.', price: 150000, stock: 10, categoryName: 'Pakaian', images: ['https://picsum.photos/id/1020/400/300'] },
      { name: 'Kaos Koperasi Desa Sinduadi', description: 'Kaos katun combed 30s dengan sablon kualitas tinggi logo koperasi.', price: 75000, stock: 30, categoryName: 'Pakaian', images: ['https://picsum.photos/id/1021/400/300'] },
      { name: 'Pupuk Kompos Kandang Organik 10kg', description: 'Pupuk organik matang hasil pengolahan kotoran ternak dan daun kering.', price: 25000, stock: 45, categoryName: 'Pertanian', images: ['https://picsum.photos/id/1010/400/300'] },
      { name: 'Benih Cabai Rawit Unggul Desa', description: 'Kemasan 100 biji benih cabai rawit super pedas tahan hama.', price: 8000, stock: 150, categoryName: 'Pertanian', images: ['https://picsum.photos/id/1011/400/300'] },
      { name: 'Pakan Pelet Ikan Lele Nila 5kg', description: 'Pelet apung nutrisi tinggi mengandung protein 30% untuk percepatan tumbuh.', price: 65000, stock: 25, categoryName: 'Perikanan', images: ['https://picsum.photos/id/1000/400/300'] },
      { name: 'Sabun Minyak Kelapa Alami Madu', description: 'Sabun mandi herbal buatan tangan berbahan kelapa, madu hutan, dan sereh.', price: 12000, stock: 60, categoryName: 'Kesehatan & Kecantikan', images: ['https://picsum.photos/id/990/400/300'] },
      { name: 'Jamu Kunyit Asam Segar 600ml', description: 'Jamu kunyit asam segar murni homemade tanpa pemanis buatan.', price: 10000, stock: 15, categoryName: 'Kesehatan & Kecantikan', images: ['https://picsum.photos/id/991/400/300'] },
    ];

    for (const p of productsData) {
      const categoryId = catMap[p.categoryName];
      if (!categoryId) continue;

      const product = await this.prisma.product.create({
        data: {
          name: p.name,
          description: p.description,
          price: p.price,
          stock: p.stock,
          categoryId,
          isActive: true,
        },
      });

      const imagesData = p.images.map((url, i) => ({
        productId: product.id,
        url,
        isPrimary: i === 0,
      }));

      await this.prisma.productImage.createMany({
        data: imagesData,
      });
    }

    // ═══════════════════════════════════════════════
    // 6. UMKM PRODUCTS - Seed products for UMKM sellers
    // ═══════════════════════════════════════════════
    const seededUmkms = await this.prisma.uMKM.findMany();
    const umkmMap = seededUmkms.reduce((acc, u) => {
      acc[u.businessName] = u.id;
      return acc;
    }, {} as Record<string, string>);

    const umkmProductsData = [
      {
        businessName: 'UMKM Jaya Abadi',
        name: 'Madu Randu Asli Hutan',
        description: 'Madu randu murni dari peternakan lebah hutan lokal, berkhasiat tinggi.',
        price: 90000,
        stock: 12,
        categoryName: 'Makanan',
        images: ['https://picsum.photos/id/1080/400/300'],
      },
      {
        businessName: 'Warung Sari Rasa',
        name: 'Kopi Lanang Robusta',
        description: 'Kopi lanang robusta premium dengan aroma kuat dan rasa mantap.',
        price: 55000,
        stock: 24,
        categoryName: 'Minuman',
        images: ['https://picsum.photos/id/1060/400/300'],
      },
      {
        businessName: 'UMKM Jaya Abadi',
        name: 'Keripik Pisang Tanduk Pedas Manis',
        description: 'Keripik pisang tanduk renyah dengan rasa pedas manis yang pas.',
        price: 15000,
        stock: 3, // Low stock on purpose
        categoryName: 'Cemilan',
        images: ['https://picsum.photos/id/1070/400/300'],
      },
      {
        businessName: 'Kerajinan Bambu Nusantara',
        name: 'Keranjang Rajut Bambu Estetik',
        description: 'Keranjang serbaguna dari rajutan bambu tipis berkualitas.',
        price: 38000,
        stock: 8,
        categoryName: 'Kerajinan',
        images: ['https://picsum.photos/id/1040/400/300'],
      },
    ];

    let seededUmkmProductsCount = 0;
    for (const p of umkmProductsData) {
      const umkmId = umkmMap[p.businessName];
      const categoryId = catMap[p.categoryName];
      if (!umkmId || !categoryId) continue;

      const umkmProduct = await this.prisma.uMKMProduct.create({
        data: {
          umkmId,
          name: p.name,
          description: p.description,
          price: p.price,
          stock: p.stock,
          categoryId,
          isApproved: true,
          isActive: true,
        },
      });

      const imagesData = p.images.map((url, i) => ({
        umkmProductId: umkmProduct.id,
        url,
        isPrimary: i === 0,
      }));

      await this.prisma.productImage.createMany({
        data: imagesData,
      });

      seededUmkmProductsCount++;
    }

    // ═══════════════════════════════════════════════
    // 7. ORDER ITEMS FOR UMKM - Create some orders containing UMKM products
    // ═══════════════════════════════════════════════
    const customer = createdUsers['customer@kopdes.co'];
    const address = await this.prisma.address.findFirst({ where: { userId: customer.id } });
    const umkmProdList = await this.prisma.uMKMProduct.findMany({ include: { images: true } });

    if (customer && address && umkmProdList.length > 0) {
      // Create a completed order
      const order1 = await this.prisma.order.create({
        data: {
          customerId: customer.id,
          totalAmount: 180000,
          status: OrderStatus.COMPLETED,
          paymentMethod: 'QRIS',
          paymentStatus: 'PAID',
          deliveryAddressId: address.id,
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        },
      });

      await this.prisma.orderItem.create({
        data: {
          orderId: order1.id,
          umkmProductId: umkmProdList[0].id, // Madu Randu
          quantity: 2,
          price: umkmProdList[0].price,
        },
      });

      // Create a payment record
      await this.prisma.payment.create({
        data: {
          orderId: order1.id,
          method: 'QRIS',
          status: 'PAID',
          amount: 180000,
          transactionId: `TX-${Date.now()}-1`,
          paidAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      });

      // Create a pending order for dashboard notification testing
      const order2 = await this.prisma.order.create({
        data: {
          customerId: customer.id,
          totalAmount: 55000,
          status: OrderStatus.PENDING,
          paymentMethod: 'COD',
          paymentStatus: 'PENDING',
          deliveryAddressId: address.id,
          createdAt: new Date(),
        },
      });

      await this.prisma.orderItem.create({
        data: {
          orderId: order2.id,
          umkmProductId: umkmProdList[1].id, // Kopi Lanang
          quantity: 1,
          price: umkmProdList[1].price,
        },
      });
    }

    return {
      message: 'Seeding completed successfully!',
      usersCount: usersData.length,
      categoriesCount: categories.length,
      productsCount: productsData.length,
      umkmProductsCount: seededUmkmProductsCount,
      info: 'All users have password: password123',
      accounts: usersData.map(u => ({ email: u.email, role: u.role })),
    };
  }
}
