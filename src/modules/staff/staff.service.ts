import { ForbiddenException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** Konteks staf yang sudah ditempelkan `PermissionsGuard` ke `req.user`. */
export interface StaffUser {
  id: string;
  role: Role;
  kopdesId: string | null;
  permissions: string[];
}

/** Status yang dihitung sebagai "pesanan baru" di KPI dan daftar prioritas. */
const NEW_STATUSES: OrderStatus[] = ['PENDING', 'PAID'];

/** Pesanan yang sudah menghasilkan uang — dasar seluruh angka keuangan. */
const REVENUE_STATUSES: OrderStatus[] = [
  'PAID',
  'PROCESSING',
  'READY_FOR_DELIVERY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
];

export type FinancePeriod = 'today' | 'week' | 'month';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kopdes yang boleh dibaca pemanggil.
   *
   * Staf desa wajib punya penugasan; tanpa itu permintaannya ditolak, bukan
   * diperlakukan sebagai "boleh lihat semua". Super Admin memang lintas desa,
   * dan boleh menyebut `kopdesId` mana pun lewat query.
   */
  resolveScope(user: StaffUser, requested?: string): string | null {
    if (user.role === Role.SUPER_ADMIN) return requested ?? null;
    if (!user.kopdesId) {
      throw new ForbiddenException(
        'Akun staf belum ditugaskan ke Kopdes mana pun',
      );
    }
    if (requested && requested !== user.kopdesId) {
      throw new ForbiddenException('Anda tidak berwenang atas Kopdes tersebut');
    }
    return user.kopdesId;
  }

  /**
   * Filter pesanan milik satu Kopdes.
   *
   * `Order` tidak menyimpan `kopdesId` sendiri, jadi kepemilikan ditelusuri
   * lewat barisnya: produk Kopdes langsung, atau produk mitra yang bernaung
   * di Kopdes itu. Keduanya diindeks pada kolom `kopdesId`.
   */
  private orderScope(kopdesId: string | null): Prisma.OrderWhereInput {
    if (!kopdesId) return {};
    return {
      items: {
        some: {
          OR: [
            { product: { kopdesId } },
            { umkmProduct: { umkm: { kopdesId } } },
          ],
        },
      },
    };
  }

  private productScope(kopdesId: string | null): Prisma.ProductWhereInput {
    return kopdesId ? { kopdesId } : {};
  }

  // ── KPI operasional ────────────────────────────────────────────────────
  /**
   * Empat angka header dashboard, dihitung dengan `count` di database.
   *
   * Sengaja bukan `findMany().length`: menarik seluruh pesanan dan produk ke
   * perangkat hanya untuk empat angka adalah beban jaringan yang tumbuh
   * seiring umur koperasi.
   */
  async summary(kopdesId: string | null) {
    const orderWhere = this.orderScope(kopdesId);
    const productWhere = this.productScope(kopdesId);

    const [newOrders, needProcessing, readyToShip, lowStockProducts] =
      await Promise.all([
        this.prisma.order.count({
          where: { ...orderWhere, status: { in: NEW_STATUSES } },
        }),
        this.prisma.order.count({
          where: { ...orderWhere, status: 'PROCESSING' },
        }),
        this.prisma.order.count({
          where: { ...orderWhere, status: 'READY_FOR_DELIVERY' },
        }),
        this.lowStockCount(productWhere),
      ]);

    return { newOrders, needProcessing, readyToShip, lowStockProducts };
  }

  /**
   * Produk yang stoknya menyentuh ambang pesan ulang miliknya sendiri.
   *
   * Perbandingan antar-kolom (`stock <= minStock`) belum didukung Prisma
   * pada `count`, jadi dipakai raw query — bukan mengambil semua produk lalu
   * menyaringnya di memori Node.
   */
  private async lowStockCount(where: Prisma.ProductWhereInput) {
    const kopdesId = (where as { kopdesId?: string }).kopdesId ?? null;
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Product"
      WHERE "isActive" = true
        AND "stock" > 0
        AND "stock" <= "minStock"
        AND (${kopdesId}::text IS NULL OR "kopdesId" = ${kopdesId}::text)
    `;
    return Number(rows[0]?.count ?? 0);
  }

  // ── Pesanan hari ini ───────────────────────────────────────────────────
  /**
   * Pesanan prioritas untuk kartu dashboard.
   *
   * Dibatasi `limit` (maksimal 10) karena ini ringkasan, bukan daftar kerja
   * — daftar penuhnya ada di halaman Pesanan yang berhalaman.
   */
  async todayOrders(kopdesId: string | null, limit = 3) {
    const capped = Math.min(Math.max(limit, 1), 10);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const orders = await this.prisma.order.findMany({
      where: {
        ...this.orderScope(kopdesId),
        createdAt: { gte: startOfDay },
        status: { notIn: ['CANCELLED'] },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: capped,
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        customer: { select: { name: true } },
        delivery: { select: { id: true, status: true, courierId: true } },
        items: {
          select: {
            quantity: true,
            product: {
              select: {
                name: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { url: true },
                },
              },
            },
            umkmProduct: {
              select: {
                name: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { url: true },
                },
              },
            },
          },
        },
      },
    });

    return orders.map((o) => {
      const first = o.items[0];
      const thumbnail =
        first?.product?.images[0]?.url ??
        first?.umkmProduct?.images[0]?.url ??
        null;
      return {
        id: o.id,
        // Nomor yang dibaca pegawai, bukan uuid penuh.
        reference: `KMP-${o.id.slice(0, 4).toUpperCase()}`,
        customerName: o.customer.name,
        itemCount: o.items.length,
        totalAmount: o.totalAmount.toString(),
        status: o.status,
        createdAt: o.createdAt,
        thumbnailUrl: thumbnail,
        deliveryId: o.delivery?.id ?? null,
        courierAssigned: Boolean(o.delivery?.courierId),
      };
    });
  }

  // ── Ringkasan stok ─────────────────────────────────────────────────────
  async stockSummary(kopdesId: string | null) {
    const scope = this.productScope(kopdesId);
    const [activeProducts, outOfStock, lowStock] = await Promise.all([
      this.prisma.product.count({ where: { ...scope, isActive: true } }),
      this.prisma.product.count({
        where: { ...scope, isActive: true, stock: 0 },
      }),
      this.lowStockCount(scope),
    ]);
    return { activeProducts, lowStock, outOfStock };
  }

  // ── Keuangan ───────────────────────────────────────────────────────────
  /**
   * Rekap keuangan satu periode beserta pembandingnya.
   *
   * Nominal dijumlahkan di database sebagai `Decimal` dan dikirim sebagai
   * string. Angka rupiah tidak pernah melewati `double` di sini: 3.450.000
   * masih aman, tetapi total bulanan koperasi tidak, dan pembulatan diam-diam
   * pada uang adalah bug yang baru terlihat saat rekonsiliasi kas.
   */
  async finance(kopdesId: string | null, period: FinancePeriod) {
    const { current, previous } = periodRanges(period);
    const scope = this.orderScope(kopdesId);

    const [now, before] = await Promise.all([
      this.financeSlice(scope, current),
      this.financeSlice(scope, previous),
    ]);

    return {
      period,
      from: current.gte,
      to: current.lt,
      grossSales: now.gross,
      transactionCount: now.count,
      refundTotal: now.refund,
      codTotal: now.cod,
      qrisTotal: now.qris,
      previousGrossSales: before.gross,
      changePercent: percentChange(now.gross, before.gross),
      // Ongkir dan diskon kini punya kolomnya sendiri di `Order`, jadi
      // keduanya dilaporkan apa adanya. Nol di sini berarti "tidak ada
      // ongkir yang dibebankan", bukan "datanya tidak ada".
      itemsSubtotal: now.subtotal,
      discountTotal: now.discount,
      shippingTotal: now.shipping,
    };
  }

  private async financeSlice(
    scope: Prisma.OrderWhereInput,
    range: { gte: Date; lt: Date },
  ) {
    const where: Prisma.OrderWhereInput = {
      ...scope,
      createdAt: range,
      status: { in: REVENUE_STATUSES },
    };

    const [agg, cod, qris, refund] = await Promise.all([
      this.prisma.order.aggregate({
        where,
        _sum: {
          totalAmount: true,
          subtotal: true,
          shippingFee: true,
          discountAmount: true,
        },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { ...where, paymentMethod: 'COD' },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: { ...where, paymentMethod: 'QRIS' },
        _sum: { totalAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: 'REFUNDED',
          createdAt: range,
          order: scope.items ? { items: scope.items } : {},
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      gross: decimalToString(agg._sum.totalAmount),
      subtotal: decimalToString(agg._sum.subtotal),
      shipping: decimalToString(agg._sum.shippingFee),
      discount: decimalToString(agg._sum.discountAmount),
      count: agg._count._all,
      cod: decimalToString(cod._sum.totalAmount),
      qris: decimalToString(qris._sum.totalAmount),
      refund: decimalToString(refund._sum.amount),
    };
  }

  // ── Status operasional toko ────────────────────────────────────────────
  /**
   * Buka/tutup dihitung dari `operatingHours` Kopdes, bukan dari tombol di
   * layar. Tanpa jadwal tersimpan status dikembalikan `null` supaya UI
   * menulis "jadwal belum diatur" alih-alih menebak "Tutup".
   */
  async storeStatus(kopdesId: string | null, now = new Date()) {
    if (!kopdesId) return null;
    const kopdes = await this.prisma.koperasi.findUnique({
      where: { id: kopdesId },
      select: {
        id: true,
        name: true,
        village: true,
        logoUrl: true,
        isActive: true,
        operatingHours: true,
      },
    });
    if (!kopdes) return null;

    const today = todayHours(kopdes.operatingHours, now);
    const isOpen =
      kopdes.isActive && today !== null ? withinHours(today, now) : null;

    return {
      kopdesId: kopdes.id,
      name: kopdes.name,
      village: kopdes.village,
      logoUrl: kopdes.logoUrl,
      isActive: kopdes.isActive,
      isOpen,
      opensAt: today?.open ?? null,
      closesAt: today?.close ?? null,
    };
  }
}

// ── Utilitas ─────────────────────────────────────────────────────────────

function decimalToString(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(2);
}

/**
 * Perubahan terhadap periode sebelumnya, dalam persen bulat.
 *
 * Basis nol tidak menghasilkan Infinity: tanpa penjualan kemarin tidak ada
 * persentase yang bermakna, jadi dikembalikan null dan UI menyembunyikannya.
 */
export function percentChange(
  current: string,
  previous: string,
): number | null {
  const prev = Number(previous);
  if (!Number.isFinite(prev) || prev === 0) return null;
  const curr = Number(current);
  return Math.round(((curr - prev) / prev) * 100);
}

export function periodRanges(period: FinancePeriod, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === 'week') {
    // Minggu berjalan dimulai Senin — pekan kerja koperasi, bukan Minggu.
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
  } else if (period === 'month') {
    start.setDate(1);
  }

  const end = new Date(start);
  if (period === 'today') end.setDate(end.getDate() + 1);
  else if (period === 'week') end.setDate(end.getDate() + 7);
  else end.setMonth(end.getMonth() + 1);

  const prevStart = new Date(start);
  const prevEnd = new Date(start);
  if (period === 'today') prevStart.setDate(prevStart.getDate() - 1);
  else if (period === 'week') prevStart.setDate(prevStart.getDate() - 7);
  else prevStart.setMonth(prevStart.getMonth() - 1);

  return {
    current: { gte: start, lt: end },
    previous: { gte: prevStart, lt: prevEnd },
  };
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function todayHours(
  operatingHours: unknown,
  now: Date,
): { open: string; close: string } | null {
  if (!operatingHours || typeof operatingHours !== 'object') return null;
  const entry = (operatingHours as Record<string, unknown>)[
    DAY_KEYS[now.getDay()]
  ];
  if (!entry || typeof entry !== 'object') return null;
  const { open, close } = entry as { open?: unknown; close?: unknown };
  if (typeof open !== 'string' || typeof close !== 'string') return null;
  return { open, close };
}

export function withinHours(
  hours: { open: string; close: string },
  now: Date,
): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  if (open === null || close === null) return false;
  // Jam tutup lewat tengah malam (mis. 18:00–01:00) membungkus ke hari
  // berikutnya, sehingga perbandingan lurus akan selalu menjawab "tutup".
  return close >= open
    ? minutes >= open && minutes < close
    : minutes >= open || minutes < close;
}

function toMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}
