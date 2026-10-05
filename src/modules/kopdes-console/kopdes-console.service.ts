import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PayoutStatus,
  Prisma,
  Role,
  UMKMStatus,
} from '@prisma/client';
import { OrderService } from '../order/order.service';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/authenticated-request';
import {
  isOpenNow,
  normalizeOperatingHours,
} from '../koperasi/opening-hours.util';
import {
  KopdesProductQueryDto,
  UpdateKopdesProfileDto,
} from './dto/kopdes-console.dto';

const PROFILE_SELECT = {
  id: true,
  name: true,
  description: true,
  logoUrl: true,
  address: true,
  village: true,
  district: true,
  city: true,
  province: true,
  postalCode: true,
  phone: true,
  operatingHours: true,
  isActive: true,
  isVerified: true,
} satisfies Prisma.KoperasiSelect;

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true } },
  images: { orderBy: { isPrimary: 'desc' } },
  reviews: { select: { rating: true } },
} satisfies Prisma.ProductInclude;

/**
 * Konsol pengurus Kopdes: bentuk respons sengaja sama dengan konsol penjual
 * UMKM (`/seller/products`, `/seller/profile`) supaya aplikasi memakai
 * halaman yang sama untuk keduanya.
 */
@Injectable()
export class KopdesConsoleService {
  constructor(private readonly prisma: PrismaService) {}

  /** Kopdes milik akun ini. Super Admin tidak terikat satu Kopdes. */
  private kopdesOf(user: AuthenticatedUser): string {
    if (!user.kopdesId) {
      throw new ForbiddenException(
        user.role === Role.SUPER_ADMIN
          ? 'Konsol Kopdes dipakai pengurus satu Kopdes; Super Admin memakai panel super admin.'
          : 'Akun ini belum ditugaskan ke Kopdes mana pun.',
      );
    }
    return user.kopdesId;
  }

  // ── Profil ───────────────────────────────────────────────────

  async profile(user: AuthenticatedUser) {
    const id = this.kopdesOf(user);
    const k = await this.prisma.koperasi.findUnique({
      where: { id },
      select: PROFILE_SELECT,
    });
    if (!k) throw new NotFoundException('Kopdes tidak ditemukan');
    const rating = await this.prisma.review.aggregate({
      where: { koperasiId: id },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return {
      ...k,
      isOpen: isOpenNow(k.operatingHours),
      rating: rating._avg.rating ? Number(rating._avg.rating.toFixed(1)) : 0,
      reviewCount: rating._count._all,
    };
  }

  async updateProfile(user: AuthenticatedUser, dto: UpdateKopdesProfileDto) {
    const id = this.kopdesOf(user);
    let operatingHours: Prisma.InputJsonObject | undefined;
    if (dto.operatingHours !== undefined) {
      try {
        operatingHours = normalizeOperatingHours(
          dto.operatingHours,
        ) as Prisma.InputJsonObject;
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    }
    await this.prisma.koperasi.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        address: dto.address,
        phone: dto.phone,
        postalCode: dto.postalCode,
        operatingHours,
      },
    });
    return this.profile(user);
  }

  // ── Dasbor ───────────────────────────────────────────────────

  /**
   * Ringkasan dasbor, bentuknya sama dengan `stats` dasbor penjual UMKM.
   *
   * Omzet = barang milik Kopdes sendiri (bukan barang mitra yang ikut
   * lewat marketplace — itu uang UMKM). Antrean pesanan memakai cakupan
   * pesanan Kopdes seutuhnya, karena pengurus memproses keduanya.
   * "Hari ini" dihitung dalam WIB: server berjalan dalam UTC, dan tengah
   * malam UTC adalah pukul 07.00 di desa.
   */
  async dashboard(user: AuthenticatedUser, now = new Date()) {
    const kopdesId = this.kopdesOf(user);
    const wib = 7 * 3600_000;
    const local = new Date(now.getTime() + wib);
    const today = new Date(
      Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
      ) - wib,
    );
    const month = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - wib,
    );
    const earned = [
      OrderStatus.PAID,
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
    ];
    const own: Prisma.OrderItemWhereInput = { product: { kopdesId } };

    const sales = async (from: Date) => {
      const [items, orders] = await Promise.all([
        this.prisma.orderItem.findMany({
          where: {
            ...own,
            order: { status: { in: earned }, createdAt: { gte: from } },
          },
          select: { quantity: true, price: true },
        }),
        this.prisma.order.count({
          where: {
            items: { some: own },
            status: { in: earned },
            createdAt: { gte: from },
          },
        }),
      ]);
      return {
        amount: items.reduce((s, i) => s + i.quantity * Number(i.price), 0),
        orders,
      };
    };

    const min = this.prisma.product.fields.minStock;
    const [
      day,
      mon,
      totalProducts,
      totalOrders,
      sold,
      rating,
      lowStockCount,
      newOrdersCount,
      pendingMitra,
      pendingPayouts,
    ] = await Promise.all([
      sales(today),
      sales(month),
      this.prisma.product.count({ where: { kopdesId, isActive: true } }),
      this.prisma.order.count({ where: OrderService.kopdesScope(kopdesId) }),
      this.prisma.orderItem.aggregate({
        where: {
          ...own,
          order: {
            status: { in: [OrderStatus.DELIVERED, OrderStatus.COMPLETED] },
          },
        },
        _sum: { quantity: true },
      }),
      this.prisma.review.aggregate({
        where: { koperasiId: kopdesId },
        _avg: { rating: true },
      }),
      this.prisma.product.count({
        where: { kopdesId, isActive: true, stock: { lte: min } },
      }),
      this.prisma.order.count({
        where: {
          ...OrderService.kopdesScope(kopdesId),
          status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
        },
      }),
      this.prisma.uMKM.count({
        where: { kopdesId, status: UMKMStatus.PENDING_VERIFICATION },
      }),
      this.prisma.uMKMPayout.count({
        where: { umkm: { kopdesId }, status: PayoutStatus.REQUESTED },
      }),
    ]);

    return {
      totalProducts,
      totalOrders,
      productsSold: sold._sum.quantity ?? 0,
      todayEarnings: day.amount,
      todayOrders: day.orders,
      monthlyEarnings: mon.amount,
      monthlyOrders: mon.orders,
      storeRating: rating._avg.rating
        ? Number(rating._avg.rating.toFixed(1))
        : 0,
      lowStockCount,
      newOrdersCount,
      pendingMitra,
      pendingPayouts,
    };
  }

  // ── Produk ───────────────────────────────────────────────────

  /**
   * Rentang stok per status memakai `minStock` MASING-MASING produk —
   * barang Kopdes punya batas menipisnya sendiri, tidak seperti UMKM.
   */
  private stockRange(status: 'safe' | 'low' | 'out'): Prisma.ProductWhereInput {
    const min = this.prisma.product.fields.minStock;
    switch (status) {
      case 'out':
        return { stock: { lte: 0 } };
      case 'low':
        return { AND: [{ stock: { gt: 0 } }, { stock: { lte: min } }] };
      case 'safe':
        return { AND: [{ stock: { gt: 0 } }, { stock: { gt: min } }] };
    }
  }

  private mapProduct(
    p: Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>,
  ) {
    const { reviews, ...rest } = p;
    const rating =
      reviews.length > 0
        ? Number(
            (
              reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
            ).toFixed(1),
          )
        : 0;
    return {
      ...rest,
      price: Number(p.price),
      discountPrice: p.discountPrice == null ? null : Number(p.discountPrice),
      // Barang Kopdes tidak melewati persetujuan.
      isApproved: true,
      rating,
    };
  }

  async products(user: AuthenticatedUser, q: KopdesProductQueryDto) {
    const kopdesId = this.kopdesOf(user);
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;

    const base: Prisma.ProductWhereInput = { kopdesId };
    if (q.categoryId) base.categoryId = q.categoryId;
    if (q.search) {
      base.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
        { sku: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const where: Prisma.ProductWhereInput = q.stockStatus
      ? { AND: [base, this.stockRange(q.stockStatus)] }
      : base;

    const [rows, total, safe, low, out] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
      this.prisma.product.count({
        where: { AND: [base, this.stockRange('safe')] },
      }),
      this.prisma.product.count({
        where: { AND: [base, this.stockRange('low')] },
      }),
      this.prisma.product.count({
        where: { AND: [base, this.stockRange('out')] },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      products: rows.map((r) => this.mapProduct(r)),
      meta: { total, page, limit, totalPages },
      summary: { total: safe + low + out, safe, low, out },
      // Null: batasnya per produk (`minStock` di tiap baris), bukan satu
      // angka untuk semua.
      lowStockThreshold: null,
    };
  }

  async product(user: AuthenticatedUser, id: string) {
    const kopdesId = this.kopdesOf(user);
    const p = await this.prisma.product.findFirst({
      where: { id, kopdesId },
      include: PRODUCT_INCLUDE,
    });
    if (!p)
      throw new NotFoundException('Produk tidak ditemukan di Kopdes Anda');
    return this.mapProduct(p);
  }

  async productCategories(user: AuthenticatedUser) {
    const kopdesId = this.kopdesOf(user);
    const groups = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: { kopdesId },
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const cats = await this.prisma.category.findMany({
      where: { id: { in: groups.map((g) => g.categoryId) } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const n = new Map(groups.map((g) => [g.categoryId, g._count._all]));
    return cats.map((c) => ({ ...c, productCount: n.get(c.id) ?? 0 }));
  }
}
