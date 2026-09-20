import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateReviewDto, ListReviewQueryDto } from './dto/review.dto';

/** Status pesanan yang sudah boleh diulas — barangnya sudah diterima. */
const REVIEWABLE_ORDER_STATUSES = ['DELIVERED', 'COMPLETED'] as const;

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Menentukan sasaran ulasan dan memastikan hanya satu yang terisi.
   *
   * Empat kolom sasaran pada satu tabel memang mengundang request yang
   * mengisi dua sekaligus; baris seperti itu akan lolos ke database dan
   * menghitung ganda pada rata-rata rating.
   */
  private resolveTarget(dto: CreateReviewDto) {
    const targets = [
      dto.productId && { key: 'productId' as const, id: dto.productId },
      dto.umkmProductId && {
        key: 'umkmProductId' as const,
        id: dto.umkmProductId,
      },
      dto.koperasiId && { key: 'koperasiId' as const, id: dto.koperasiId },
      dto.umkmId && { key: 'umkmId' as const, id: dto.umkmId },
    ].filter(Boolean) as { key: string; id: string }[];

    if (targets.length !== 1) {
      throw new BadRequestException(
        'Isi tepat satu sasaran ulasan: productId, umkmProductId, koperasiId, atau umkmId',
      );
    }
    return targets[0];
  }

  /**
   * Memastikan pengulas memang pernah menerima barang itu.
   *
   * Tanpa pemeriksaan ini rating produk bisa digerakkan siapa pun yang
   * memanggil API — dan rating adalah angka yang dipakai pembeli lain untuk
   * memutuskan belanja.
   */
  private async assertPurchased(
    userId: string,
    target: { key: string; id: string },
    orderId?: string,
  ) {
    if (target.key !== 'productId' && target.key !== 'umkmProductId') {
      // Ulasan untuk Kopdes atau Mitra sebagai tempat tidak terikat pesanan.
      return;
    }
    if (!orderId) {
      throw new BadRequestException(
        'orderId wajib disertakan untuk ulasan produk',
      );
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: userId,
        status: { in: [...REVIEWABLE_ORDER_STATUSES] },
        items: {
          some:
            target.key === 'productId'
              ? { productId: target.id }
              : { umkmProductId: target.id },
        },
      },
      select: { id: true },
    });

    if (!order) {
      throw new ForbiddenException(
        'Ulasan hanya bisa ditulis untuk produk pada pesanan Anda yang sudah diterima',
      );
    }
  }

  async create(userId: string, dto: CreateReviewDto) {
    const target = this.resolveTarget(dto);
    await this.assertPurchased(userId, target, dto.orderId);

    try {
      return await this.prisma.review.create({
        data: {
          userId,
          rating: dto.rating,
          comment: dto.comment?.trim() || null,
          [target.key]: target.id,
        },
        include: {
          user: { select: { id: true, name: true } },
        },
      });
    } catch (e) {
      // Unique (userId, target) — satu pengguna satu ulasan per sasaran.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Anda sudah menulis ulasan untuk ini');
      }
      throw e;
    }
  }

  async update(userId: string, id: string, rating: number, comment?: string) {
    const existing = await this.prisma.review.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ulasan tidak ditemukan');
    if (existing.userId !== userId) {
      throw new ForbiddenException('Ulasan ini bukan milik Anda');
    }

    return this.prisma.review.update({
      where: { id },
      data: { rating, comment: comment?.trim() || null },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  /** Ulasan sebuah produk, terbaru dulu, berhalaman. */
  async list(query: ListReviewQueryDto) {
    if (!!query.productId === !!query.umkmProductId) {
      throw new BadRequestException(
        'Isi tepat satu dari productId atau umkmProductId',
      );
    }

    const where: Prisma.ReviewWhereInput = query.productId
      ? { productId: query.productId }
      : { umkmProductId: query.umkmProductId };

    const take = Math.min(Math.max(query.limit ?? 10, 1), 50);
    const page = Math.max(query.page ?? 1, 1);

    const [items, total, agg] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip: (page - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true } } },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({ where, _avg: { rating: true } }),
    ]);

    return {
      items,
      // Dibulatkan dua desimal di sini, bukan di klien: setiap layar yang
      // membulatkan sendiri akan menampilkan angka yang sedikit berbeda.
      averageRating:
        agg._avg.rating == null
          ? null
          : Math.round(agg._avg.rating * 100) / 100,
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }

  /**
   * Produk pada sebuah pesanan yang **belum** diulas pengguna ini.
   *
   * Dipakai Flutter untuk memutuskan apakah tombol "Beri Ulasan" muncul —
   * tanpa ini tombolnya akan tetap tampil lalu ditolak 409 saat ditekan.
   */
  async reviewableItems(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: userId,
        status: { in: [...REVIEWABLE_ORDER_STATUSES] },
      },
      select: {
        items: {
          select: {
            productId: true,
            umkmProductId: true,
            product: { select: { id: true, name: true } },
            umkmProduct: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!order) return { items: [] };

    const productIds = order.items
      .map((i) => i.productId)
      .filter((id): id is string => Boolean(id));
    const umkmProductIds = order.items
      .map((i) => i.umkmProductId)
      .filter((id): id is string => Boolean(id));

    const reviewed = await this.prisma.review.findMany({
      where: {
        userId,
        OR: [
          { productId: { in: productIds } },
          { umkmProductId: { in: umkmProductIds } },
        ],
      },
      select: { productId: true, umkmProductId: true },
    });

    const done = new Set(
      reviewed.map((r) => r.productId ?? r.umkmProductId).filter(Boolean),
    );

    const items = order.items
      .map((i) => {
        const id = i.productId ?? i.umkmProductId;
        const name = i.product?.name ?? i.umkmProduct?.name;
        if (!id || !name || done.has(id)) return null;
        return {
          productId: i.productId,
          umkmProductId: i.umkmProductId,
          name,
        };
      })
      .filter(Boolean);

    return { items };
  }
}
