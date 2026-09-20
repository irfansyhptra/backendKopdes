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

  async findOne(id: string) {
    const mitra = await this.prisma.uMKM.findFirst({
      where: { id, status: UMKMStatus.ACTIVE },
      select: {
        ...CARD_SELECT,
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
