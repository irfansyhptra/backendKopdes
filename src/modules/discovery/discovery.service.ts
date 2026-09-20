import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';

import { CacheService } from '../../cache/cache.service';
import { PrismaService } from '../../database/prisma.service';
import {
  BestSellersQueryDto,
  FeaturedQueryDto,
} from './dto/discovery-query.dto';
import { summarize } from '../../common/rating/rating.util';
import { PERIOD_DAYS } from './period';

/**
 * Status pesanan yang dihitung sebagai penjualan nyata.
 *
 * PENDING belum tentu jadi — pesanan bisa batal sebelum dibayar. CANCELLED
 * jelas tidak dihitung. Memasukkan keduanya membuat "Terjual 240+" menjadi
 * angka yang tidak pernah benar-benar terjadi.
 */
const SOLD_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
];

/** Gambar & kategori diambil seperlunya, bukan seluruh relasi. */
const PRODUCT_SELECT = {
  id: true,
  name: true,
  price: true,
  stock: true,
  images: { orderBy: { isPrimary: Prisma.SortOrder.desc }, take: 1 },
} as const;

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Produk terlaris berdasarkan agregasi item pesanan yang sah.
   *
   * Agregasi dilakukan di database, bukan di perangkat pengguna: menghitung
   * seluruh riwayat transaksi di klien berarti mengunduh semuanya lebih dulu.
   */
  async bestSellers(query: BestSellersQueryDto) {
    const { limit = 10, period = '30d' } = query;
    const cacheKey = `cache:best-sellers:${period}:${limit}`;

    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) return cached;

    const days = PERIOD_DAYS[period];
    const since = days
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : undefined;

    const orderFilter = {
      status: { in: SOLD_STATUSES },
      ...(since ? { createdAt: { gte: since } } : {}),
    };

    // Produk koperasi dan produk UMKM diagregasi terpisah karena berada di
    // dua kolom berbeda pada OrderItem, lalu digabung dan diurutkan bersama.
    const [koperasiGroups, umkmGroups] = await Promise.all([
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: { productId: { not: null }, order: orderFilter },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: limit,
      }),
      this.prisma.orderItem.groupBy({
        by: ['umkmProductId'],
        where: { umkmProductId: { not: null }, order: orderFilter },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: limit,
      }),
    ]);

    const koperasiIds = koperasiGroups
      .map((g) => g.productId)
      .filter((id): id is string => id !== null);
    const umkmIds = umkmGroups
      .map((g) => g.umkmProductId)
      .filter((id): id is string => id !== null);

    const [products, umkmProducts] = await Promise.all([
      koperasiIds.length
        ? this.prisma.product.findMany({
            where: { id: { in: koperasiIds }, isActive: true },
            select: { ...PRODUCT_SELECT, kopdes: { select: { name: true } } },
          })
        : [],
      umkmIds.length
        ? this.prisma.uMKMProduct.findMany({
            where: { id: { in: umkmIds }, isActive: true, isApproved: true },
            select: {
              ...PRODUCT_SELECT,
              umkm: { select: { businessName: true } },
            },
          })
        : [],
    ]);

    const soldByProduct = new Map(
      koperasiGroups.map((g) => [g.productId, g._sum.quantity ?? 0]),
    );
    const soldByUmkmProduct = new Map(
      umkmGroups.map((g) => [g.umkmProductId, g._sum.quantity ?? 0]),
    );

    const merged = [
      ...products.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        stock: p.stock,
        imageUrl: p.images[0]?.url ?? null,
        sellerName: p.kopdes?.name ?? 'Kopdes',
        source: 'KOPERASI' as const,
        soldCount: soldByProduct.get(p.id) ?? 0,
      })),
      ...umkmProducts.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        stock: p.stock,
        imageUrl: p.images[0]?.url ?? null,
        sellerName: p.umkm?.businessName ?? 'Mitra UMKM',
        source: 'UMKM' as const,
        soldCount: soldByUmkmProduct.get(p.id) ?? 0,
      })),
    ]
      .sort((a, b) => b.soldCount - a.soldCount)
      .slice(0, limit)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    const result = { products: merged, period, total: merged.length };

    // Agregasi ini sering diakses dan berubah lambat; 10 menit sudah cukup.
    await this.cache.set(cacheKey, result, 600);
    return result;
  }

  /** Produk UMKM yang ditandai admin sebagai pilihan. */
  async featuredUmkmProducts(query: FeaturedQueryDto) {
    const { limit = 10 } = query;

    const rows = await this.prisma.uMKMProduct.findMany({
      where: {
        isFeatured: true,
        isActive: true,
        isApproved: true,
        umkm: { status: 'ACTIVE' },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        ...PRODUCT_SELECT,
        umkm: { select: { id: true, businessName: true } },
      },
    });

    return {
      products: rows.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        stock: p.stock,
        imageUrl: p.images[0]?.url ?? null,
        umkmId: p.umkm?.id ?? null,
        sellerName: p.umkm?.businessName ?? 'Mitra UMKM',
        source: 'UMKM' as const,
      })),
      total: rows.length,
    };
  }

  /** Banner aktif yang sedang berada dalam jendela tayangnya. */
  async activeBanners() {
    const now = new Date();
    const rows = await this.prisma.banner.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    return { banners: rows, total: rows.length };
  }

  /**
   * Detail satu produk Mitra UMKM untuk pelanggan.
   *
   * Sebelumnya tidak ada endpoint ini sama sekali: menekan produk UMKM di
   * beranda mengarah ke `GET /products/:id` yang hanya melihat tabel Product,
   * sehingga selalu 404.
   *
   * Hanya produk aktif & disetujui dari mitra ACTIVE yang boleh terlihat —
   * aturan yang sama dengan daftar mitra publik.
   */
  async umkmProductDetail(id: string) {
    const product = await this.prisma.uMKMProduct.findFirst({
      where: {
        id,
        isActive: true,
        isApproved: true,
        umkm: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        stock: true,
        isPreOrderAllowed: true,
        preOrderAvailableAt: true,
        images: { orderBy: { isPrimary: Prisma.SortOrder.desc } },
        category: { select: { id: true, name: true } },
        umkm: {
          select: {
            id: true,
            businessName: true,
            address: true,
            phone: true,
            category: true,
            latitude: true,
            longitude: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Produk UMKM tidak ditemukan.');
    }

    const aggregate = await this.prisma.review.aggregate({
      where: { umkmProductId: id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return {
      ...product,
      price: Number(product.price),
      source: 'UMKM' as const,
      rating: summarize(aggregate._avg.rating, aggregate._count.rating),
    };
  }
}
