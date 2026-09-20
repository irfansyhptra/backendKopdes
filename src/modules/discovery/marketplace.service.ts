import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, UMKMStatus } from '@prisma/client';

import {
  haversineMeters,
  formatDistance,
  isValidCoordinate,
} from '../../common/geo/geo.util';
import { EMPTY_RATING, toRatingMap } from '../../common/rating/rating.util';
import { PrismaService } from '../../database/prisma.service';
import { MarketplaceQueryDto } from './dto/marketplace-query.dto';

/// Bentuk produk terpadu yang dikirim ke klien. Diekspor karena menjadi
/// bagian dari tipe kembalian publik controller.
export interface MergedProduct {
  id: string;
  name: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  categoryId: string;
  categoryName: string | null;
  sellerId: string | null;
  sellerName: string;
  source: 'KOPDES' | 'UMKM';
  createdAt: Date;
  latitude: number | null;
  longitude: number | null;
  distanceMeters?: number;
  distanceLabel?: string;
  rating: typeof EMPTY_RATING;
}

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Katalog terpadu: produk Kopdes **dan** produk Mitra UMKM dalam satu daftar.
   *
   * Endpoint `/products` yang lama hanya membaca tabel Product, sehingga
   * produk mitra tidak pernah bisa muncul di Marketplace sama sekali.
   *
   * ponytail: keduanya diambil terpisah lalu digabung di aplikasi, karena
   * Prisma tidak bisa mengurutkan dan memaginasi dua tabel sekaligus. Yang
   * diambil dibatasi `page * limit` per tabel supaya tidak pernah memindai
   * seluruh katalog. Kalau katalog tumbuh sampai ribuan baris, ganti dengan
   * satu view SQL atau tabel indeks pencarian.
   */
  async findProducts(query: MarketplaceQueryDto) {
    const { sellerType = 'ALL', sort = 'newest', page = 1, limit = 20 } = query;

    const wantsDistance = sort === 'distance';
    const origin =
      query.latitude !== undefined && query.longitude !== undefined
        ? { latitude: query.latitude, longitude: query.longitude }
        : null;

    if (wantsDistance && (!origin || !isValidCoordinate(origin))) {
      throw new BadRequestException(
        'Pengurutan berdasarkan jarak memerlukan koordinat yang valid.',
      );
    }

    // Batas atas pengambilan per tabel: cukup untuk mengisi halaman yang
    // diminta setelah penggabungan, tanpa memindai seluruh tabel.
    const fetchLimit = page * limit;

    // Jumlah sebenarnya dihitung terpisah lewat count(). Memakai panjang
    // hasil gabungan sebagai total akan salah, karena yang diambil dibatasi
    // `page * limit` per tabel — totalPages menjadi terlalu kecil dan
    // infinite scroll berhenti sebelum katalog habis.
    const [koperasiRows, umkmRows, koperasiCount, umkmCount] =
      await Promise.all([
        sellerType === 'UMKM'
          ? []
          : this.prisma.product.findMany({
              where: this.koperasiWhere(query),
              take: fetchLimit,
              orderBy: this.prismaOrderBy(sort),
              select: {
                id: true,
                name: true,
                price: true,
                stock: true,
                categoryId: true,
                createdAt: true,
                category: { select: { name: true } },
                images: {
                  orderBy: { isPrimary: Prisma.SortOrder.desc },
                  take: 1,
                },
                kopdes: {
                  select: {
                    id: true,
                    name: true,
                    latitude: true,
                    longitude: true,
                  },
                },
              },
            }),
        sellerType === 'KOPDES'
          ? []
          : this.prisma.uMKMProduct.findMany({
              where: this.umkmWhere(query),
              take: fetchLimit,
              orderBy: this.prismaOrderBy(sort),
              select: {
                id: true,
                name: true,
                price: true,
                stock: true,
                categoryId: true,
                createdAt: true,
                category: { select: { name: true } },
                images: {
                  orderBy: { isPrimary: Prisma.SortOrder.desc },
                  take: 1,
                },
                umkm: {
                  select: {
                    id: true,
                    businessName: true,
                    latitude: true,
                    longitude: true,
                  },
                },
              },
            }),
        sellerType === 'UMKM'
          ? 0
          : this.prisma.product.count({ where: this.koperasiWhere(query) }),
        sellerType === 'KOPDES'
          ? 0
          : this.prisma.uMKMProduct.count({ where: this.umkmWhere(query) }),
      ]);

    // Rating diambil dalam dua query groupBy untuk seluruh hasil, bukan satu
    // query per kartu.
    const [koperasiRatings, umkmRatings] = await Promise.all([
      this.ratings(
        'productId',
        koperasiRows.map((r) => r.id),
      ),
      this.ratings(
        'umkmProductId',
        umkmRows.map((r) => r.id),
      ),
    ]);

    let merged: MergedProduct[] = [
      ...koperasiRows.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        stock: p.stock,
        imageUrl: p.images[0]?.url ?? null,
        categoryId: p.categoryId,
        categoryName: p.category?.name ?? null,
        sellerId: p.kopdes?.id ?? null,
        sellerName: p.kopdes?.name ?? 'Kopdes',
        source: 'KOPDES' as const,
        createdAt: p.createdAt,
        latitude: p.kopdes?.latitude ?? null,
        longitude: p.kopdes?.longitude ?? null,
        rating: koperasiRatings.get(p.id) ?? EMPTY_RATING,
      })),
      ...umkmRows.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        stock: p.stock,
        imageUrl: p.images[0]?.url ?? null,
        categoryId: p.categoryId,
        categoryName: p.category?.name ?? null,
        sellerId: p.umkm?.id ?? null,
        sellerName: p.umkm?.businessName ?? 'Mitra UMKM',
        source: 'UMKM' as const,
        createdAt: p.createdAt,
        latitude: p.umkm?.latitude ?? null,
        longitude: p.umkm?.longitude ?? null,
        rating: umkmRatings.get(p.id) ?? EMPTY_RATING,
      })),
    ];

    if (origin) {
      merged = merged.map((item) => {
        if (item.latitude === null || item.longitude === null) return item;
        const meters = haversineMeters(origin, {
          latitude: item.latitude,
          longitude: item.longitude,
        });
        return {
          ...item,
          distanceMeters: Math.round(meters),
          distanceLabel: formatDistance(meters),
        };
      });
    }

    if (wantsDistance) {
      const radiusMeters = (query.radius ?? 25) * 1000;
      // Produk tanpa koordinat penjual dibuang saat mengurutkan jarak —
      // bukan dianggap berjarak nol dan naik ke puncak daftar.
      merged = merged.filter(
        (i) =>
          i.distanceMeters !== undefined && i.distanceMeters <= radiusMeters,
      );
    }

    merged.sort(this.comparator(sort));

    // Pada pengurutan jarak, penyaringan radius terjadi setelah pengambilan,
    // sehingga jumlah sebenarnya hanya diketahui dari hasil yang tersaring.
    const total = wantsDistance ? merged.length : koperasiCount + umkmCount;
    const start = (page - 1) * limit;

    return {
      products: merged.slice(start, start + limit),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private koperasiWhere(q: MarketplaceQueryDto): Prisma.ProductWhereInput {
    return {
      isActive: true,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.inStock === true ? { stock: { gt: 0 } } : {}),
      ...this.priceWhere(q),
      ...(q.search
        ? { name: { contains: q.search, mode: Prisma.QueryMode.insensitive } }
        : {}),
    };
  }

  private umkmWhere(q: MarketplaceQueryDto): Prisma.UMKMProductWhereInput {
    return {
      isActive: true,
      isApproved: true,
      umkm: { status: UMKMStatus.ACTIVE },
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.inStock === true ? { stock: { gt: 0 } } : {}),
      ...this.priceWhere(q),
      ...(q.search
        ? { name: { contains: q.search, mode: Prisma.QueryMode.insensitive } }
        : {}),
    };
  }

  private priceWhere(q: MarketplaceQueryDto) {
    if (q.minPrice === undefined && q.maxPrice === undefined) return {};
    return {
      price: {
        ...(q.minPrice !== undefined ? { gte: q.minPrice } : {}),
        ...(q.maxPrice !== undefined ? { lte: q.maxPrice } : {}),
      },
    };
  }

  /// Urutan di database dipakai untuk memilih baris mana yang diambil;
  /// urutan akhir tetap ditentukan setelah penggabungan.
  private prismaOrderBy(sort: string) {
    switch (sort) {
      case 'price_asc':
        return { price: Prisma.SortOrder.asc };
      case 'price_desc':
        return { price: Prisma.SortOrder.desc };
      default:
        return { createdAt: Prisma.SortOrder.desc };
    }
  }

  private comparator(sort: string) {
    return (a: MergedProduct, b: MergedProduct) => {
      switch (sort) {
        case 'price_asc':
          return a.price - b.price;
        case 'price_desc':
          return b.price - a.price;
        case 'distance':
          return (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0);
        default:
          return b.createdAt.getTime() - a.createdAt.getTime();
      }
    };
  }

  private async ratings(key: 'productId' | 'umkmProductId', ids: string[]) {
    if (ids.length === 0) return new Map<string, typeof EMPTY_RATING>();
    const groups = await this.prisma.review.groupBy({
      by: [key],
      where: { [key]: { in: ids } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    return toRatingMap(groups, key);
  }
}
