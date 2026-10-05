import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { canTransition } from '../order/order-transitions';
import { handOverToCourier } from '../delivery/courier-handoff';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { StorageService } from '../../storage/storage.service';
import { OrderService } from '../order/order.service';
import { CreateSellerProductDto } from './dto/create-seller-product.dto';
import { UpdateSellerProductDto } from './dto/update-seller-product.dto';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';
import { OrderStatus, Prisma } from '@prisma/client';
import {
  isOpenNow,
  normalizeOperatingHours,
} from '../koperasi/opening-hours.util';

/**
 * Batas stok menipis untuk produk UMKM: stok 1..5 menipis, 0 habis.
 *
 * Satu-satunya sumber angka ini. Dasbor memakainya untuk "Stok menipis",
 * daftar produk memakainya untuk ringkasan dan filter, dan nilainya ikut
 * dikirim ke aplikasi supaya label di tiap baris tidak menebak sendiri.
 */
export const LOW_STOCK_THRESHOLD = 5;

export type StockStatusFilter = 'safe' | 'low' | 'out';

/** Rentang stok tiap status — dipakai filter dan hitungan ringkasan. */
const STOCK_RANGE: Record<StockStatusFilter, Prisma.IntFilter> = {
  out: { lte: 0 },
  low: { gt: 0, lte: LOW_STOCK_THRESHOLD },
  safe: { gt: LOW_STOCK_THRESHOLD },
};

/** Status yang boleh dipasang penjual sendiri. */
const SELLER_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PROCESSING,
  OrderStatus.READY_FOR_DELIVERY,
];

/** Kolom profil yang boleh dilihat pemilik toko — tanpa data akun. */
const PROFILE_SELECT = {
  id: true,
  businessName: true,
  description: true,
  address: true,
  phone: true,
  category: true,
  photoUrl: true,
  bannerUrl: true,
  operatingHours: true,
  status: true,
  rejectionReason: true,
  verifiedAt: true,
  latitude: true,
  longitude: true,
  kopdes: { select: { id: true, name: true } },
} satisfies Prisma.UMKMSelect;

/** `isOpen`: true/false, atau null bila jam buka belum diisi. */
const withOpenNow = <T extends { operatingHours: Prisma.JsonValue }>(
  umkm: T,
) => ({ ...umkm, isOpen: isOpenNow(umkm.operatingHours) });

@Injectable()
export class SellerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly storageService: StorageService,
    private readonly orders: OrderService,
  ) {}

  // Helpers to get UMKM profile by user ID
  async getUmkmByUserId(userId: string) {
    const umkm = await this.prisma.uMKM.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!umkm) {
      throw new NotFoundException('UMKM profile not found for this user');
    }
    return umkm;
  }

  // Dashboard Stats with Caching
  async getDashboard(userId: string) {
    const umkm = await this.getUmkmByUserId(userId);
    const cacheKey = `cache:seller:dashboard:${umkm.id}`;

    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // 1. Total Products
    const totalProducts = await this.prisma.uMKMProduct.count({
      where: { umkmId: umkm.id, isActive: true },
    });

    // 2. Total Orders (orders containing seller's products)
    const totalOrders = await this.prisma.order.count({
      where: { items: { some: { umkmProduct: { umkmId: umkm.id } } } },
    });

    // 3. Products Sold (sum of quantity of completed order items)
    const productsSoldResult = await this.prisma.orderItem.aggregate({
      where: {
        umkmProduct: { umkmId: umkm.id },
        order: {
          status: { in: [OrderStatus.DELIVERED, OrderStatus.COMPLETED] },
        },
      },
      _sum: { quantity: true },
    });
    const productsSold = productsSoldResult._sum.quantity || 0;

    // 4. Earnings (Today vs Month)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Jumlah TRANSAKSI, bukan jumlah baris barang: satu pesanan berisi tiga
    // barang tetap satu transaksi. `orderItem.findMany` di bawah menghitung
    // omzetnya, dan memakai panjangnya sebagai jumlah transaksi akan
    // melebih-lebihkan hari yang pembelinya memborong.
    const todayOrders = await this.prisma.order.count({
      where: {
        items: { some: { umkmProduct: { umkmId: umkm.id } } },
        status: {
          in: [OrderStatus.PAID, OrderStatus.DELIVERED, OrderStatus.COMPLETED],
        },
        createdAt: { gte: startOfToday },
      },
    });

    const todayEarningsResult = await this.prisma.orderItem.findMany({
      where: {
        umkmProduct: { umkmId: umkm.id },
        order: {
          status: {
            in: [
              OrderStatus.PAID,
              OrderStatus.DELIVERED,
              OrderStatus.COMPLETED,
            ],
          },
          createdAt: { gte: startOfToday },
        },
      },
      select: { quantity: true, price: true },
    });
    const todayEarnings = todayEarningsResult.reduce(
      (sum, item) => sum + item.quantity * Number(item.price),
      0,
    );

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyOrders = await this.prisma.order.count({
      where: {
        items: { some: { umkmProduct: { umkmId: umkm.id } } },
        status: {
          in: [OrderStatus.PAID, OrderStatus.DELIVERED, OrderStatus.COMPLETED],
        },
        createdAt: { gte: startOfMonth },
      },
    });

    const monthlyEarningsResult = await this.prisma.orderItem.findMany({
      where: {
        umkmProduct: { umkmId: umkm.id },
        order: {
          status: {
            in: [
              OrderStatus.PAID,
              OrderStatus.DELIVERED,
              OrderStatus.COMPLETED,
            ],
          },
          createdAt: { gte: startOfMonth },
        },
      },
      select: { quantity: true, price: true },
    });
    const monthlyEarnings = monthlyEarningsResult.reduce(
      (sum, item) => sum + item.quantity * Number(item.price),
      0,
    );

    // 5. Store Rating
    const ratingResult = await this.prisma.review.aggregate({
      where: { umkmProduct: { umkmId: umkm.id } },
      _avg: { rating: true },
    });
    const storeRating = ratingResult._avg.rating
      ? Number(ratingResult._avg.rating.toFixed(1))
      : 0.0;

    // 6. Produk yang perlu restok: menipis ATAU habis (stok <= ambang)
    const lowStockCount = await this.prisma.uMKMProduct.count({
      where: {
        umkmId: umkm.id,
        stock: { lte: LOW_STOCK_THRESHOLD },
        isActive: true,
      },
    });

    const lowStockProducts = await this.prisma.uMKMProduct.findMany({
      where: {
        umkmId: umkm.id,
        stock: { lte: LOW_STOCK_THRESHOLD },
        isActive: true,
      },
      include: { category: true },
      take: 5,
    });

    // 7. New Order Notifications (Pending / Processing)
    const newOrdersCount = await this.prisma.order.count({
      where: {
        status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
        items: { some: { umkmProduct: { umkmId: umkm.id } } },
      },
    });

    // 8. Recent Activities (combining recent order items, reviews)
    const [recentOrderItems, recentReviews] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: { umkmProduct: { umkmId: umkm.id } },
        include: {
          order: {
            select: { customer: { select: { name: true } }, createdAt: true },
          },
          umkmProduct: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.review.findMany({
        where: { umkmProduct: { umkmId: umkm.id } },
        include: { user: { select: { name: true } }, umkmProduct: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const activities = [];
    for (const item of recentOrderItems) {
      activities.push({
        type: 'ORDER',
        title: 'Pesanan Baru Masuk',
        description: `${item.order.customer.name} membeli ${item.quantity}x ${item.umkmProduct?.name}`,
        timestamp: item.order.createdAt,
      });
    }

    for (const r of recentReviews) {
      activities.push({
        type: 'REVIEW',
        title: 'Ulasan Produk Baru',
        description: `${r.user.name} memberikan bintang ${r.rating} untuk ${r.umkmProduct?.name}`,
        timestamp: r.createdAt,
      });
    }

    for (const prod of lowStockProducts) {
      activities.push({
        type: 'STOCK_WARN',
        title: 'Stok Hampir Habis',
        description: `Stok produk ${prod.name} tersisa ${prod.stock} unit`,
        timestamp: prod.updatedAt,
      });
    }

    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const result = {
      storeInfo: {
        id: umkm.id,
        businessName: umkm.businessName,
        description: umkm.description,
        address: umkm.address,
        phone: umkm.phone,
        status: umkm.status,
        verifiedAt: umkm.verifiedAt,
      },
      stats: {
        totalProducts,
        totalOrders,
        productsSold,
        todayEarnings,
        todayOrders,
        monthlyEarnings,
        monthlyOrders,
        storeRating,
        lowStockCount,
        newOrdersCount,
      },
      lowStockProducts: lowStockProducts.map((p) => ({
        ...p,
        price: Number(p.price),
      })),
      recentActivities: activities.slice(0, 8),
    };

    // Cache in Redis for 10 minutes (600 seconds)
    await this.cacheService.set(cacheKey, result, 600);

    return result;
  }

  // Profile Retrieval & Update
  /**
   * Profil toko untuk pemiliknya.
   *
   * Kolom dipilih satu per satu. Versi sebelumnya mengembalikan baris UMKM
   * dengan `include: { user: true }` apa adanya — termasuk hash kata sandi
   * pemilik toko, terkirim ke ponsel di setiap pembukaan tab Toko.
   */
  async getProfile(userId: string) {
    const umkm = await this.prisma.uMKM.findUnique({
      where: { userId },
      select: PROFILE_SELECT,
    });
    if (!umkm) {
      throw new NotFoundException('UMKM profile not found for this user');
    }
    return withOpenNow(umkm);
  }

  async updateProfile(userId: string, dto: UpdateSellerProfileDto) {
    const umkm = await this.getUmkmByUserId(userId);

    let operatingHours: Prisma.InputJsonValue | undefined;
    if (dto.operatingHours !== undefined) {
      try {
        operatingHours = normalizeOperatingHours(
          dto.operatingHours,
        ) as Prisma.InputJsonObject;
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    }

    const updated = await this.prisma.uMKM.update({
      where: { id: umkm.id },
      data: {
        businessName: dto.businessName,
        description: dto.description,
        address: dto.address,
        phone: dto.phone,
        category: dto.category,
        operatingHours,
      },
      select: PROFILE_SELECT,
    });

    await this.invalidateCache(umkm.id);

    return withOpenNow(updated);
  }

  async updateProfileMedia(
    userId: string,
    files?: {
      logo?: Express.Multer.File[];
      banner?: Express.Multer.File[];
    },
  ) {
    const logo = files?.logo?.[0];
    const banner = files?.banner?.[0];
    if (!logo && !banner) {
      throw new BadRequestException(
        'Pilih logo atau banner toko terlebih dahulu.',
      );
    }

    const umkm = await this.getUmkmByUserId(userId);
    const uploaded: { logo?: string; banner?: string } = {};
    const updated = await (async () => {
      try {
        if (logo) {
          uploaded.logo = await this.storageService.uploadFile(
            logo,
            `stores/umkm/${umkm.id}/logo`,
          );
        }
        if (banner) {
          uploaded.banner = await this.storageService.uploadFile(
            banner,
            `stores/umkm/${umkm.id}/banner`,
          );
        }
        return await this.prisma.uMKM.update({
          where: { id: umkm.id },
          data: {
            photoUrl: uploaded.logo,
            bannerUrl: uploaded.banner,
          },
          select: PROFILE_SELECT,
        });
      } catch (error) {
        if (uploaded.logo) await this.storageService.deleteFile(uploaded.logo);
        if (uploaded.banner)
          await this.storageService.deleteFile(uploaded.banner);
        throw error;
      }
    })();

    await this.invalidateCache(umkm.id);
    if (uploaded.logo && umkm.photoUrl) {
      await this.storageService.deleteFile(umkm.photoUrl);
    }
    if (uploaded.banner && umkm.bannerUrl) {
      await this.storageService.deleteFile(umkm.bannerUrl);
    }
    return withOpenNow(updated);
  }

  // Product List (with caching)
  async getProducts(
    userId: string,
    query: {
      search?: string;
      categoryId?: string;
      stockStatus?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const umkm = await this.getUmkmByUserId(userId);
    const { search, categoryId } = query;
    const page = Math.max(query.page || 1, 1);
    // 100, bukan lebih kecil: APK lama mencari detail produk di 100 baris
    // pertama, dan harus tetap jalan sampai pengguna memperbarui aplikasi.
    const limit = Math.min(Math.max(query.limit || 10, 1), 100);
    const skip = (page - 1) * limit;
    // Nilai di luar daftar diabaikan, bukan ditolak: filter yang tidak
    // dikenal lebih baik jatuh ke "Semua" daripada mengosongkan layar.
    const stockStatus = (['safe', 'low', 'out'] as const).find(
      (s) => s === query.stockStatus,
    );

    const cacheKey = `cache:seller:products:${umkm.id}:${search || ''}:${categoryId || ''}:${stockStatus || ''}:${page}:${limit}`;
    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // Pencarian + kategori. Ringkasan dihitung di atas ini — TANPA filter
    // status stok — supaya "2 aman · 1 menipis" tetap menjelaskan apa yang
    // ada di kategori itu walau penjual sedang melihat yang menipis saja.
    const base: Prisma.UMKMProductWhereInput = { umkmId: umkm.id };
    if (categoryId) {
      base.categoryId = categoryId;
    }
    if (search) {
      base.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    const where: Prisma.UMKMProductWhereInput = stockStatus
      ? { ...base, stock: STOCK_RANGE[stockStatus] }
      : base;

    const [products, total, safe, low, out] = await Promise.all([
      this.prisma.uMKMProduct.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          images: {
            orderBy: { isPrimary: 'desc' },
          },
          reviews: { select: { rating: true } },
        },
      }),
      this.prisma.uMKMProduct.count({ where }),
      this.prisma.uMKMProduct.count({
        where: { ...base, stock: STOCK_RANGE.safe },
      }),
      this.prisma.uMKMProduct.count({
        where: { ...base, stock: STOCK_RANGE.low },
      }),
      this.prisma.uMKMProduct.count({
        where: { ...base, stock: STOCK_RANGE.out },
      }),
    ]);

    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const result = {
      products: products.map((p) => this.mapProduct(p)),
      // Bentuk lama dipertahankan untuk pemanggil yang sudah ada; `meta`
      // adalah bentuk yang dibaca `Paginated` di aplikasi.
      total,
      page,
      limit,
      totalPages,
      meta: { total, page, limit, totalPages },
      summary: { total: safe + low + out, safe, low, out },
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    };

    // Cache in Redis for 10 minutes (600 seconds)
    await this.cacheService.set(cacheKey, result, 600);

    return result;
  }

  /**
   * Satu produk milik toko ini.
   *
   * Halaman detail dulu mencarinya di 100 produk pertama — produk ke-101
   * terbaca "tidak ditemukan" padahal ada.
   */
  async getProduct(userId: string, id: string) {
    const umkm = await this.getUmkmByUserId(userId);
    const product = await this.prisma.uMKMProduct.findFirst({
      where: { id, umkmId: umkm.id },
      include: {
        category: true,
        images: { orderBy: { isPrimary: 'desc' } },
        reviews: { select: { rating: true } },
      },
    });
    if (!product) {
      throw new NotFoundException('Produk tidak ditemukan di toko Anda');
    }
    return this.mapProduct(product);
  }

  /**
   * Kategori yang benar-benar dipakai produk toko ini, untuk chip filter.
   *
   * Bukan seluruh `/categories`: chip "Elektronik" di toko yang hanya
   * menjual makanan selalu berujung daftar kosong.
   */
  async getProductCategories(userId: string) {
    const umkm = await this.getUmkmByUserId(userId);
    const groups = await this.prisma.uMKMProduct.groupBy({
      by: ['categoryId'],
      where: { umkmId: umkm.id },
      _count: { _all: true },
    });
    if (groups.length === 0) return [];

    const categories = await this.prisma.category.findMany({
      where: { id: { in: groups.map((g) => g.categoryId) } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const counts = new Map(groups.map((g) => [g.categoryId, g._count._all]));
    return categories.map((c) => ({
      ...c,
      productCount: counts.get(c.id) ?? 0,
    }));
  }

  private mapProduct<
    T extends { price: Prisma.Decimal; reviews: { rating: number }[] },
  >(p: T) {
    const { reviews, ...rest } = p;
    const avgRating =
      reviews.length > 0
        ? Number(
            (
              reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
            ).toFixed(1),
          )
        : 0.0;
    return { ...rest, price: Number(p.price), rating: avgRating };
  }

  // Create Product
  async createProduct(
    userId: string,
    dto: CreateSellerProductDto,
    files?: any[],
  ) {
    const umkm = await this.getUmkmByUserId(userId);

    // Verify category
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new BadRequestException(
        `Category with ID ${dto.categoryId} not found`,
      );
    }

    // Create UMKMProduct
    const product = await this.prisma.uMKMProduct.create({
      data: {
        umkmId: umkm.id,
        name: dto.name,
        description: dto.description ?? '',
        price: dto.price,
        stock: dto.stock,
        categoryId: dto.categoryId,
        // Langsung tampil. UMKM-nya sudah diverifikasi Admin Kopdes saat
        // menjadi mitra, dan Admin tetap bisa menurunkan produk lewat
        // takedown. Dulu `false` tanpa jalur persetujuan apa pun: produk
        // baru tidak pernah muncul di marketplace maupun bisa dibeli.
        isApproved: true,
        isActive: true,
      },
    });

    // Upload Images to MinIO/Supabase Storage
    if (files && files.length > 0) {
      const imagesData = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const objectKey = await this.storageService.uploadFile(
          file,
          'products',
        );
        const url = await this.storageService.getPublicUrl(objectKey);
        imagesData.push({
          umkmProductId: product.id,
          url,
          isPrimary: i === 0,
        });
      }

      await this.prisma.productImage.createMany({
        data: imagesData,
      });
    }

    await this.invalidateCache(umkm.id);

    return this.prisma.uMKMProduct.findUnique({
      where: { id: product.id },
      include: {
        category: true,
        images: true,
      },
    });
  }

  // Update Product
  async updateProduct(
    userId: string,
    productId: string,
    dto: UpdateSellerProductDto,
    files?: any[],
  ) {
    const umkm = await this.getUmkmByUserId(userId);

    const product = await this.prisma.uMKMProduct.findFirst({
      where: { id: productId, umkmId: umkm.id },
    });
    if (!product) {
      throw new NotFoundException(
        `Product with ID ${productId} not found under your store`,
      );
    }

    // Check category if changing
    if (dto.categoryId && dto.categoryId !== product.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException(
          `Category with ID ${dto.categoryId} not found`,
        );
      }
    }

    // Upload and add new images
    if (files && files.length > 0) {
      const primaryImageExists = await this.prisma.productImage.findFirst({
        where: { umkmProductId: productId, isPrimary: true },
      });

      const imagesData = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const objectKey = await this.storageService.uploadFile(
          file,
          'products',
        );
        const url = await this.storageService.getPublicUrl(objectKey);
        imagesData.push({
          umkmProductId: productId,
          url,
          isPrimary: !primaryImageExists && i === 0,
        });
      }

      await this.prisma.productImage.createMany({
        data: imagesData,
      });
    }

    const updated = await this.prisma.uMKMProduct.update({
      where: { id: productId },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        stock: dto.stock,
        categoryId: dto.categoryId,
        isActive: dto.isActive,
      },
      include: {
        category: true,
        images: true,
      },
    });

    await this.invalidateCache(umkm.id);

    return {
      ...updated,
      price: Number(updated.price),
    };
  }

  // Delete/Deactivate Product
  async deleteProduct(userId: string, productId: string) {
    const umkm = await this.getUmkmByUserId(userId);

    const product = await this.prisma.uMKMProduct.findFirst({
      where: { id: productId, umkmId: umkm.id },
    });
    if (!product) {
      throw new NotFoundException(
        `Product with ID ${productId} not found under your store`,
      );
    }

    // Hard delete or deactivate
    // The prompt says "deactivasi/soft delete". Let's update isActive to false.
    await this.prisma.uMKMProduct.update({
      where: { id: productId },
      data: { isActive: false },
    });

    await this.invalidateCache(umkm.id);
  }

  // Get Orders containing seller's products
  async getOrders(userId: string) {
    const umkm = await this.getUmkmByUserId(userId);

    // Get orders containing this seller's products
    const orders = await this.prisma.order.findMany({
      where: {
        items: {
          some: { umkmProduct: { umkmId: umkm.id } },
        },
      },
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true },
        },
        items: {
          where: { umkmProduct: { umkmId: umkm.id } },
          include: { umkmProduct: { include: { images: true } } },
        },
        deliveryAddress: true,
        delivery: {
          include: {
            courier: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((o) => ({
      ...o,
      totalAmount: Number(o.totalAmount),
      items: o.items.map((i) => ({
        ...i,
        price: Number(i.price),
      })),
    }));
  }

  // Get Single Order Detail
  async getOrderDetail(userId: string, orderId: string) {
    const umkm = await this.getUmkmByUserId(userId);

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        items: { some: { umkmProduct: { umkmId: umkm.id } } },
      },
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true },
        },
        items: {
          where: { umkmProduct: { umkmId: umkm.id } },
          include: { umkmProduct: { include: { images: true } } },
        },
        deliveryAddress: true,
        delivery: {
          include: { courier: { select: { name: true, phone: true } } },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        `Order with ID ${orderId} not found or doesn't belong to your products`,
      );
    }

    return {
      ...order,
      totalAmount: Number(order.totalAmount),
      items: order.items.map((i) => ({
        ...i,
        price: Number(i.price),
      })),
    };
  }

  // Update order status (for workflow integration)
  async updateOrderStatus(
    userId: string,
    orderId: string,
    status: OrderStatus,
  ) {
    const umkm = await this.getUmkmByUserId(userId);

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        items: { some: { umkmProduct: { umkmId: umkm.id } } },
      },
    });

    if (!order) {
      throw new NotFoundException(
        `Order with ID ${orderId} not found or doesn't belong to your store`,
      );
    }

    // Penjual hanya menyiapkan pesanan. Dulu status apa pun ditulis langsung
    // — termasuk COMPLETED untuk pesanan yang belum dibayar, padahal saldo
    // yang bisa dicairkan dihitung dari pesanan COMPLETED. Bayar, antar,
    // selesai, dan batal punya jalurnya sendiri (webhook, kurir, pembeli,
    // pengurus) yang juga mengurus stok dan uangnya.
    if (!SELLER_ORDER_STATUSES.includes(status)) {
      throw new ForbiddenException(
        'Penjual hanya bisa menandai pesanan "Diproses" atau "Siap Diantar".',
      );
    }
    if (!canTransition(order.status, status)) {
      throw new BadRequestException(
        `Pesanan berstatus ${order.status} tidak bisa diubah menjadi ${status}.`,
      );
    }

    // "Siap Diantar" dari penjual = diserahkan ke kurir Kopdes.
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: orderId },
        data: { status },
      });
      if (status === OrderStatus.READY_FOR_DELIVERY) {
        row.status = (await handOverToCourier(tx, orderId)) ?? row.status;
      }
      return row;
    });

    await this.invalidateCache(umkm.id);
    // Kembalikan bentuk yang sama dengan GET /seller/orders/:id. Respons
    // `order.update` hanya berisi kolom Order; aplikasi kemudian mencoba
    // membaca customer, alamat, item, dan delivery lalu menganggap tindakan
    // gagal meski status COD sebenarnya sudah tersimpan.
    return this.getOrderDetail(userId, orderId);
  }

  // ── Pembatalan ───────────────────────────────────────────────

  /** Pengajuan pembatalan atas pesanan yang memuat barang toko ini. */
  async pendingCancellations(userId: string) {
    const umkm = await this.getUmkmByUserId(userId);
    return this.orders.pendingCancellations({ umkmId: umkm.id });
  }

  /**
   * Penjual menyetujui atau menolak pengajuan pembatalan pembeli.
   *
   * Kepemilikan barang diperiksa di `OrderService.decideCancellation`:
   * `umkmId` toko inilah yang menentukan pesanan mana yang boleh diputus.
   */
  async decideCancellation(
    userId: string,
    orderId: string,
    approve: boolean,
    reason?: string,
  ) {
    const umkm = await this.getUmkmByUserId(userId);
    const result = await this.orders.decideCancellation(
      { id: userId, umkmId: umkm.id },
      orderId,
      approve,
      reason,
    );
    await this.invalidateCache(umkm.id);
    return result;
  }

  // Get Sales Statistics for charts
  async getStatistics(userId: string) {
    const umkm = await this.getUmkmByUserId(userId);
    const cacheKey = `cache:seller:stats:${umkm.id}`;

    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // Gather last 7 days of sales
    const statistics = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const items = await this.prisma.orderItem.findMany({
        where: {
          umkmProduct: { umkmId: umkm.id },
          order: {
            status: {
              in: [
                OrderStatus.PAID,
                OrderStatus.DELIVERED,
                OrderStatus.COMPLETED,
              ],
            },
            createdAt: { gte: date, lt: nextDay },
          },
        },
        select: { quantity: true, price: true },
      });

      const totalRevenue = items.reduce(
        (sum, item) => sum + item.quantity * Number(item.price),
        0,
      );
      const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);

      // format day name (e.g. Sen, Sel, Rab, Kam, Jum, Sab, Min)
      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      const dayName = dayNames[date.getDay()];

      statistics.push({
        date: date.toISOString().split('T')[0],
        day: dayName,
        revenue: totalRevenue,
        unitsSold: totalUnits,
      });
    }

    // Cache for 30 minutes (1800 seconds)
    await this.cacheService.set(cacheKey, statistics, 1800);

    return statistics;
  }

  // Helper to invalidate cache
  private async invalidateCache(umkmId: string) {
    await this.cacheService.delete(`cache:seller:dashboard:${umkmId}`);
    await this.cacheService.delete(`cache:seller:stats:${umkmId}`);
    await this.cacheService.deletePattern(`cache:seller:products:${umkmId}:*`);
  }
}
