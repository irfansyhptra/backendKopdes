import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UMKMStatus } from '@prisma/client';

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
import { isOpenNow } from '../koperasi/opening-hours.util';
import { MitraNearbyQueryDto } from './dto/mitra-nearby-query.dto';
import { MitraListQueryDto } from './dto/mitra-list-query.dto';

/// Hanya kolom yang dipakai card. Relasi produk sengaja tidak di-include.
const CARD_SELECT = {
  id: true,
  businessName: true,
  description: true,
  address: true,
  phone: true,
  photoUrl: true,
  category: true,
  latitude: true,
  longitude: true,
  operatingHours: true,
  status: true,
  kopdesId: true,
} as const;

@Injectable()
export class MitraService {
  constructor(private readonly prisma: PrismaService) {}

  /// Satu query groupBy untuk seluruh hasil, bukan satu per card.
  private async ratingsFor(ids: string[]) {
    if (ids.length === 0) return new Map<string, typeof EMPTY_RATING>();
    const groups = await this.prisma.review.groupBy({
      by: ['umkmId'],
      where: { umkmId: { in: ids } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    return toRatingMap(groups, 'umkmId');
  }

  /**
   * Mitra UMKM terdekat untuk beranda customer.
   *
   * Hanya UMKM berstatus ACTIVE yang tampil: yang masih
   * PENDING_VERIFICATION, REJECTED, atau SUSPENDED tidak boleh terlihat
   * pelanggan.
   */
  async findNearby(query: MitraNearbyQueryDto) {
    const { latitude, longitude, radius = 10, page = 1, limit = 10 } = query;

    if (!isValidCoordinate({ latitude, longitude })) {
      throw new BadRequestException('Koordinat tidak valid.');
    }

    const box = boundingBox({ latitude, longitude }, radius);

    const candidates = await this.prisma.uMKM.findMany({
      where: {
        status: UMKMStatus.ACTIVE,
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
        ...(query.category ? { category: query.category } : {}),
        ...(query.search
          ? {
              businessName: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
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
    const ratings = await this.ratingsFor(withDistance.map((m) => m.id));

    let ranked = withDistance.map((m) => ({
      ...m,
      isOpen: isOpenNow(m.operatingHours),
      rating: ratings.get(m.id) ?? EMPTY_RATING,
    }));

    if (query.openNow === true) {
      ranked = ranked.filter((m) => m.isOpen === true);
    }

    const total = ranked.length;
    const start = (page - 1) * limit;

    return {
      umkm: ranked.slice(start, start + limit),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Mitra di bawah satu koperasi, tanpa konteks lokasi.
   *
   * Paginasinya di database — berbeda dengan [findNearby], yang harus
   * mengambil kandidat dulu karena jaraknya baru diketahui setelah dihitung.
   */
  async findAll(query: MitraListQueryDto) {
    const { page = 1, limit = 20 } = query;
    const where = {
      status: UMKMStatus.ACTIVE,
      ...(query.kopdesId ? { kopdesId: query.kopdesId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.withProductsOnly
        ? { products: { some: { isActive: true } } }
        : {}),
      ...(query.search
        ? {
            businessName: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };

    const select = {
      ...CARD_SELECT,
      _count: { select: { products: true } },
    };

    const origin =
      query.latitude !== undefined && query.longitude !== undefined
        ? { latitude: query.latitude, longitude: query.longitude }
        : null;

    // Tanpa koordinat: urut nama, dipotong di basis data seperti biasa.
    if (origin === null) {
      const [rows, total] = await Promise.all([
        this.prisma.uMKM.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { businessName: 'asc' },
          select,
        }),
        this.prisma.uMKM.count({ where }),
      ]);
      return this.paginate(await this.decorate(rows), total, page, limit);
    }

    if (!isValidCoordinate(origin)) {
      throw new BadRequestException('Koordinat tidak valid.');
    }

    /**
     * Dengan koordinat: seluruh baris diambil dulu, karena jaraknya baru bisa
     * dihitung setelah barisnya ada. Radiusnya tak terhingga — ini daftar
     * lengkap yang diurutkan, bukan pencarian dalam jangkauan.
     *
     * Mitra tanpa koordinat ditaruh di belakang, bukan dibuang: membuangnya
     * membuat satu toko lenyap begitu izin lokasi diberikan, lalu muncul lagi
     * begitu ditolak.
     */
    const all = await this.prisma.uMKM.findMany({ where, select });
    const withDistance = sortByDistance(all, origin, Number.POSITIVE_INFINITY);
    const placed = new Set(withDistance.map((m) => m.id));
    const ranked = [...withDistance, ...all.filter((m) => !placed.has(m.id))];
    const start = (page - 1) * limit;

    return this.paginate(
      await this.decorate(ranked.slice(start, start + limit)),
      ranked.length,
      page,
      limit,
    );
  }

  /// Melengkapi baris mentah dengan status buka, jumlah produk, dan rating.
  private async decorate<
    T extends {
      id: string;
      operatingHours: unknown;
      _count: { products: number };
    },
  >(rows: T[]) {
    const ratings = await this.ratingsFor(rows.map((m) => m.id));
    return rows.map((m) => ({
      ...m,
      isOpen: isOpenNow(m.operatingHours as never),
      productCount: m._count.products,
      rating: ratings.get(m.id) ?? EMPTY_RATING,
    }));
  }

  private paginate<T>(items: T[], total: number, page: number, limit: number) {
    return {
      umkm: items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string) {
    const mitra = await this.prisma.uMKM.findFirst({
      where: { id, status: UMKMStatus.ACTIVE },
      select: {
        ...CARD_SELECT,
        // Pemilik tokonya — tujuan tombol "Chat Toko" di aplikasi. Hanya id,
        // bukan nama atau kontaknya: yang dibutuhkan klien cuma lawan bicara
        // untuk membuka percakapan.
        userId: true,
        kopdes: { select: { id: true, name: true, village: true } },
        _count: { select: { products: true } },
      },
    });

    if (!mitra) {
      throw new NotFoundException('Mitra UMKM tidak ditemukan.');
    }

    const aggregate = await this.prisma.review.aggregate({
      where: { umkmId: id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return {
      ...mitra,
      isOpen: isOpenNow(mitra.operatingHours),
      productCount: mitra._count.products,
      rating: summarize(aggregate._avg.rating, aggregate._count.rating),
    };
  }
}
