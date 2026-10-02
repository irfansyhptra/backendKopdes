import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { MembershipStatus, Prisma, Role } from '@prisma/client';

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
import { isOpenNow, normalizeOperatingHours } from './opening-hours.util';
import { KoperasiQueryDto } from './dto/koperasi-query.dto';
import { NearbyQueryDto } from './dto/nearby-query.dto';
import { UpdateKopdesProfileDto } from './dto/membership.dto';

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
      ...(query.withProductsOnly
        ? { products: { some: { isActive: true } } }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { village: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const origin =
      query.latitude !== undefined && query.longitude !== undefined
        ? { latitude: query.latitude, longitude: query.longitude }
        : null;

    /**
     * Tanpa koordinat: urut nama, dipotong di basis data seperti biasa.
     *
     * Dengan koordinat: seluruh baris diambil dulu, karena jaraknya baru bisa
     * dihitung setelah barisnya ada — memotong di basis data lebih dulu
     * berarti mengurutkan halaman pertama menurut nama, lalu menyusunnya
     * ulang menurut jarak, dan Kopdes terdekat yang kebetulan berhuruf Z
     * tidak akan pernah muncul.
     */
    if (origin === null) {
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

      return this.paginate(await this.decorate(rows), total, page, limit);
    }

    if (!isValidCoordinate(origin)) {
      throw new BadRequestException('Koordinat tidak valid.');
    }

    const all = await this.prisma.koperasi.findMany({
      where,
      select: CARD_SELECT,
    });

    // Radius tak terhingga: ini daftar lengkap yang diurutkan, bukan
    // pencarian dalam jangkauan. Yang jauh tetap tampil, di urutan bawah.
    const withDistance = sortByDistance(all, origin, Number.POSITIVE_INFINITY);

    /**
     * Kopdes tanpa koordinat ditaruh di belakang, bukan dibuang.
     *
     * `sortByDistance` memang membuangnya — benar untuk `nearby`, yang
     * menjawab "apa yang ada dalam radius". Di sini salah: akibatnya satu
     * Kopdes hilang dari daftar begitu izin lokasi diberikan, dan muncul lagi
     * begitu ditolak.
     */
    const placed = new Set(withDistance.map((k) => k.id));
    const unlocated = all.filter((k) => !placed.has(k.id));
    const ranked = [...withDistance, ...unlocated];
    const start = (page - 1) * limit;

    return this.paginate(
      await this.decorate(ranked.slice(start, start + limit)),
      ranked.length,
      page,
      limit,
    );
  }

  /// Melengkapi baris mentah dengan status buka dan ratingnya.
  private async decorate<T extends { id: string; operatingHours: unknown }>(
    rows: T[],
  ) {
    const ratings = await this.ratingsFor(rows.map((k) => k.id));
    return rows.map((k) => ({
      ...k,
      isOpen: isOpenNow(k.operatingHours as never),
      rating: ratings.get(k.id) ?? EMPTY_RATING,
    }));
  }

  private paginate<T>(items: T[], total: number, page: number, limit: number) {
    return {
      koperasi: items,
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
        _count: {
          select: {
            products: true,
            umkms: true,
            // Hanya yang aktif: pendaftar yang menunggu belum anggota.
            members: { where: { status: MembershipStatus.ACTIVE } },
          },
        },
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

    /**
     * Pengurus yang bisa dihubungi warga — tujuan tombol "Chat Toko".
     *
     * Koperasi tidak menyimpan kolom pemilik; yang ada adalah staf dengan
     * `kopdesId` yang sama. Diambil yang tertua supaya tujuannya stabil:
     * kalau berpindah-pindah tiap permintaan, percakapan yang sama bisa
     * terbuka sebagai utas baru dengan orang lain.
     */
    const admin = await this.prisma.user.findFirst({
      where: { kopdesId: id, role: Role.ADMIN_KOPDES },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    return {
      ...koperasi,
      // Null bila koperasinya belum punya pengurus — tombol chat di klien
      // memang tidak digambar tanpa lawan bicara.
      adminUserId: admin?.id ?? null,
      isOpen: isOpenNow(koperasi.operatingHours),
      productCount: koperasi._count.products,
      umkmCount: koperasi._count.umkms,
      memberCount: koperasi._count.members,
      rating: summarize(aggregate._avg.rating, aggregate._count.rating),
    };
  }

  /**
   * Mengubah profil koperasi oleh pengurusnya.
   *
   * Alamat dan koordinat sengaja tidak bisa disentuh di sini: keduanya
   * menentukan hasil pencarian terdekat dan siapa yang dianggap sedesa,
   * jadi perubahannya lewat Super Admin.
   */
  async updateProfile(id: string, dto: UpdateKopdesProfileDto) {
    const exists = await this.prisma.koperasi.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Koperasi tidak ditemukan.');

    let operatingHours: Prisma.InputJsonValue | undefined;
    if (dto.operatingHours !== undefined) {
      try {
        // Cast: Prisma menuntut bentuk JSON-nya sendiri, sedangkan hasil
        // normalisasi sudah pasti objek yang bisa diserialisasi.
        operatingHours = normalizeOperatingHours(
          dto.operatingHours,
        ) as unknown as Prisma.InputJsonValue;
      } catch (error) {
        throw new BadRequestException((error as Error).message);
      }
    }

    return this.prisma.koperasi.update({
      where: { id },
      data: {
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.serviceCategories !== undefined
          ? {
              serviceCategories: dto.serviceCategories
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : {}),
        ...(operatingHours !== undefined ? { operatingHours } : {}),
      },
      select: CARD_SELECT,
    });
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
