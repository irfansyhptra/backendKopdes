import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import {
  boundingBox,
  isValidCoordinate,
  sortByDistance,
} from '../../common/geo/geo.util';
import {
  EMPTY_RATING,
  summarize,
  toRatingMap,
} from '../../common/rating/rating.util';
import { isOpenNow } from './opening-hours.util';
import { KoperasiQueryDto } from './dto/koperasi-query.dto';
import { NearbyQueryDto } from './dto/nearby-query.dto';

/** Kolom yang dikirim ke card beranda. Sengaja tidak menyertakan relasi berat. */
const CARD_SELECT = {
  id: true,
  name: true,
  description: true,
  logoUrl: true,
  imageUrl: true,
  address: true,
  village: true,
  district: true,
  city: true,
  province: true,
  latitude: true,
  longitude: true,
  phone: true,
  operatingHours: true,
  serviceCategories: true,
  isVerified: true,
} as const;

@Injectable()
export class KoperasiService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rating rata-rata untuk sekumpulan Kopdes sekaligus.
   *
   * Satu query groupBy untuk seluruh hasil, bukan satu query per card —
   * kalau tidak, endpoint terdekat menjadi N+1.
   */
  private async ratingsFor(ids: string[]) {
    if (ids.length === 0) return new Map<string, typeof EMPTY_RATING>();
    const groups = await this.prisma.review.groupBy({
      by: ['koperasiId'],
      where: { koperasiId: { in: ids } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    return toRatingMap(groups, 'koperasiId');
  }

  /**
   * Kopdes terdekat dari koordinat pengguna.
   *
   * Dua langkah: bounding box di database (memakai index lat/lng), lalu
   * Haversine + pengurutan di aplikasi pada sisa baris yang jauh lebih sedikit.
   */
  async findNearby(query: NearbyQueryDto) {
    const { latitude, longitude, radius = 10, page = 1, limit = 10 } = query;

    if (!isValidCoordinate({ latitude, longitude })) {
      throw new BadRequestException('Koordinat tidak valid.');
    }

    const box = boundingBox({ latitude, longitude }, radius);

    const candidates = await this.prisma.koperasi.findMany({
      where: {
        isActive: true,
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
        ...(query.search
          ? {
              OR: [
                {
                  name: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  village: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
      select: CARD_SELECT,
    });

    const withDistance = sortByDistance(
      candidates,
      { latitude, longitude },
      radius,
    );
    const ratings = await this.ratingsFor(withDistance.map((k) => k.id));

    let ranked = withDistance.map((k) => ({
      ...k,
      isOpen: isOpenNow(k.operatingHours),
      rating: ratings.get(k.id) ?? EMPTY_RATING,
    }));

    if (query.openNow === true) {
      ranked = ranked.filter((k) => k.isOpen === true);
    }

    // Paginasi setelah pengurutan: urutan jarak adalah inti dari endpoint ini,
    // jadi tidak bisa dipotong sebelum jaraknya diketahui.
    const total = ranked.length;
    const start = (page - 1) * limit;

    return {
      koperasi: ranked.slice(start, start + limit),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** Daftar Kopdes tanpa konteks lokasi — dipakai saat izin lokasi ditolak. */
  async findAll(query: KoperasiQueryDto) {
    const { page = 1, limit = 10, search } = query;
    const where = {
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { village: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.koperasi.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
        select: CARD_SELECT,
      }),
      this.prisma.koperasi.count({ where }),
    ]);

    const ratings = await this.ratingsFor(rows.map((k) => k.id));

    return {
      koperasi: rows.map((k) => ({
        ...k,
        isOpen: isOpenNow(k.operatingHours),
        rating: ratings.get(k.id) ?? EMPTY_RATING,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string) {
    const koperasi = await this.prisma.koperasi.findUnique({
      where: { id },
      select: {
        ...CARD_SELECT,
        postalCode: true,
        _count: { select: { products: true, umkms: true } },
      },
    });

    if (!koperasi) {
      throw new NotFoundException('Koperasi tidak ditemukan.');
    }

    const aggregate = await this.prisma.review.aggregate({
      where: { koperasiId: id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return {
      ...koperasi,
      isOpen: isOpenNow(koperasi.operatingHours),
      productCount: koperasi._count.products,
      umkmCount: koperasi._count.umkms,
      rating: summarize(aggregate._avg.rating, aggregate._count.rating),
    };
  }

  /// Ulasan terbaru untuk halaman detail.
  async findReviews(id: string, page = 1, limit = 10) {
    const where = { koperasiId: id };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      reviews: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Membuat atau memperbarui ulasan pengguna untuk sebuah Kopdes.
   *
   * Upsert, bukan create: unique index `(userId, koperasiId)` membatasi satu
   * ulasan per pengguna, jadi mengirim ulang berarti memperbarui penilaian —
   * bukan error yang membingungkan.
   */
  async upsertReview(
    koperasiId: string,
    userId: string,
    rating: number,
    comment?: string,
  ) {
    const exists = await this.prisma.koperasi.findUnique({
      where: { id: koperasiId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Koperasi tidak ditemukan.');

    return this.prisma.review.upsert({
      where: { userId_koperasiId: { userId, koperasiId } },
      create: { koperasiId, userId, rating, comment },
      update: { rating, comment },
      select: { id: true, rating: true, comment: true, createdAt: true },
    });
  }
}
