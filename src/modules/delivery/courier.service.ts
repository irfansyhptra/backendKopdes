import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryStatus,
  OrderStatus,
  Prisma,
  PaymentMethod,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** Tugas yang masih dipegang kurir — belum selesai, belum dilepas. */
export const COURIER_ACTIVE: DeliveryStatus[] = [
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.ACCEPTED,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.IN_TRANSIT,
];

/** Tugas yang sudah lepas dari tangan kurir. */
const COURIER_DONE: DeliveryStatus[] = [
  DeliveryStatus.COURIER_DELIVERED,
  DeliveryStatus.CUSTOMER_CONFIRMED,
  DeliveryStatus.COMPLETED,
];

/** Sebelum barang diambil, tugas masih boleh dilepas kembali. */
const RELEASABLE: DeliveryStatus[] = [
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.ACCEPTED,
];

const TASK_INCLUDE = {
  order: {
    select: {
      id: true,
      status: true,
      totalAmount: true,
      shippingFee: true,
      paymentMethod: true,
      paymentStatus: true,
      createdAt: true,
      customer: { select: { id: true, name: true, phone: true } },
      deliveryAddress: {
        select: {
          title: true,
          recipientName: true,
          phone: true,
          street: true,
          city: true,
          latitude: true,
          longitude: true,
        },
      },
      items: {
        select: {
          quantity: true,
          variantName: true,
          product: {
            select: {
              name: true,
              kopdes: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                  phone: true,
                  latitude: true,
                  longitude: true,
                },
              },
            },
          },
          umkmProduct: {
            select: {
              name: true,
              umkm: {
                select: {
                  id: true,
                  businessName: true,
                  address: true,
                  phone: true,
                  latitude: true,
                  longitude: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.DeliveryInclude;

type TaskRow = Prisma.DeliveryGetPayload<{ include: typeof TASK_INCLUDE }>;

/** Satu tempat yang harus disinggahi kurir sebelum mengantar. */
interface Pickup {
  id: string;
  kind: 'KOPDES' | 'UMKM';
  name: string;
  address: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Aplikasi kurir.
 *
 * Kurir mengambil tugas sendiri dari kumpulan terbuka milik Kopdes-nya;
 * pengurus tidak perlu menugaskan siapa pun. Yang dijaga di sini: satu tugas
 * hanya boleh jatuh ke satu kurir, dan tugas desa lain tidak pernah terlihat.
 */
@Injectable()
export class CourierService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kopdes tempat kurir bertugas.
   *
   * Kurir tanpa Kopdes tidak melihat tugas apa pun. Memperlihatkan seluruh
   * tugas se-sistem kepada kurir yang datanya belum lengkap jauh lebih buruk
   * daripada daftar kosong yang menyuruhnya menghubungi pengurus.
   */
  private async kopdesOf(courierId: string): Promise<string> {
    const me = await this.prisma.user.findUnique({
      where: { id: courierId },
      select: { kopdesId: true },
    });
    if (!me?.kopdesId) {
      throw new ForbiddenException(
        'Akun kurir Anda belum terhubung ke Kopdes mana pun. Hubungi pengurus Kopdes.',
      );
    }
    return me.kopdesId;
  }

  /** Tempat ambil barang, satu baris per toko — bukan satu per barang. */
  private pickupsOf(row: TaskRow): Pickup[] {
    const seen = new Map<string, Pickup>();
    for (const item of row.order.items) {
      const k = item.product?.kopdes;
      const u = item.umkmProduct?.umkm;
      if (k && !seen.has(k.id)) {
        seen.set(k.id, {
          id: k.id,
          kind: 'KOPDES',
          name: k.name,
          address: k.address,
          phone: k.phone,
          latitude: k.latitude,
          longitude: k.longitude,
        });
      }
      if (u && !seen.has(u.id)) {
        seen.set(u.id, {
          id: u.id,
          kind: 'UMKM',
          name: u.businessName,
          address: u.address,
          phone: u.phone,
          latitude: u.latitude,
          longitude: u.longitude,
        });
      }
    }
    return [...seen.values()];
  }

  /**
   * Bentuk yang dibaca aplikasi kurir.
   *
   * `codAmount` dipisahkan dari `totalAmount`: yang harus ditagih kurir di
   * depan pintu hanya pesanan COD yang belum lunas. Mengirim nominal untuk
   * pesanan yang sudah dibayar akan membuat kurir menagih dua kali.
   */
  private toTask(row: TaskRow) {
    const o = row.order;
    const isCod =
      o.paymentMethod === PaymentMethod.COD && o.paymentStatus !== 'PAID';
    return {
      id: row.id,
      status: row.status,
      acceptedAt: row.acceptedAt,
      pickedUpAt: row.pickedUpAt,
      courierMarkedDeliveredAt: row.courierMarkedDeliveredAt,
      customerConfirmedAt: row.customerConfirmedAt,
      createdAt: row.createdAt,
      order: {
        id: o.id,
        status: o.status,
        createdAt: o.createdAt,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        totalAmount: Number(o.totalAmount),
        shippingFee: Number(o.shippingFee),
        codAmount: isCod ? Number(o.totalAmount) : 0,
      },
      customer: o.customer,
      destination: o.deliveryAddress,
      pickups: this.pickupsOf(row),
      items: o.items.map((i) => ({
        name: i.product?.name ?? i.umkmProduct?.name ?? 'Barang',
        variantName: i.variantName,
        quantity: i.quantity,
      })),
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
    };
  }

  // ── Daftar ───────────────────────────────────────────────────

  /**
   * Tugas terbuka: belum ada kurirnya, barangnya sudah siap.
   *
   * Pesanan yang masih disiapkan toko sengaja tidak muncul — kurir yang
   * datang menjemput barang yang belum jadi hanya menunggu di tempat.
   */
  async availableTasks(courierId: string) {
    const kopdesId = await this.kopdesOf(courierId);
    const rows = await this.prisma.delivery.findMany({
      where: {
        courierId: null,
        status: { notIn: COURIER_DONE },
        order: {
          status: OrderStatus.READY_FOR_DELIVERY,
          items: {
            some: {
              OR: [
                { product: { kopdesId } },
                { umkmProduct: { umkm: { kopdesId } } },
              ],
            },
          },
        },
      },
      include: TASK_INCLUDE,
      // Yang paling lama menunggu didahulukan; pembeli yang menunggu paling
      // lama tidak boleh kalah oleh pesanan yang baru masuk.
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    return rows.map((r) => this.toTask(r));
  }

  /** Tugas yang sedang dipegang kurir ini. */
  async myTasks(courierId: string) {
    const rows = await this.prisma.delivery.findMany({
      where: { courierId, status: { in: COURIER_ACTIVE } },
      include: TASK_INCLUDE,
      orderBy: { acceptedAt: 'asc' },
    });
    return rows.map((r) => this.toTask(r));
  }

  async detail(deliveryId: string, courierId: string) {
    const row = await this.prisma.delivery.findFirst({
      where: { id: deliveryId, courierId },
      include: TASK_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Tugas pengantaran tidak ditemukan');
    }
    return this.toTask(row);
  }

  /** Log pengiriman: tugas yang sudah selesai, terbaru dulu. */
  async history(courierId: string, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const where: Prisma.DeliveryWhereInput = {
      courierId,
      status: { in: COURIER_DONE },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.delivery.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: { courierMarkedDeliveredAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.delivery.count({ where }),
    ]);
    return {
      deliveries: rows.map((r) => this.toTask(r)),
      meta: {
        total,
        page: Math.max(page, 1),
        limit: take,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    };
  }

  /**
   * Angka dasbor kurir.
   *
   * "Hari ini" dihitung sejak tengah malam WIB: server berjalan dalam UTC,
   * dan tengah malam UTC adalah pukul 07.00 di desa — tanpa pergeseran ini,
   * antaran pagi hari akan terhitung sebagai antaran kemarin.
   */
  async summary(courierId: string, now = new Date()) {
    const kopdesId = await this.kopdesOf(courierId);
    const wib = 7 * 3600_000;
    const local = new Date(now.getTime() + wib);
    const since = new Date(
      Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
      ) - wib,
    );

    const [available, active, doneToday, codRows, doneAll] = await Promise.all([
      this.prisma.delivery.count({
        where: {
          courierId: null,
          status: { notIn: COURIER_DONE },
          order: {
            status: OrderStatus.READY_FOR_DELIVERY,
            items: {
              some: {
                OR: [
                  { product: { kopdesId } },
                  { umkmProduct: { umkm: { kopdesId } } },
                ],
              },
            },
          },
        },
      }),
      this.prisma.delivery.count({
        where: { courierId, status: { in: COURIER_ACTIVE } },
      }),
      this.prisma.delivery.count({
        where: {
          courierId,
          status: { in: COURIER_DONE },
          courierMarkedDeliveredAt: { gte: since },
        },
      }),
      // Uang COD yang kurir kumpulkan hari ini — yang harus ia setorkan.
      this.prisma.delivery.findMany({
        where: {
          courierId,
          status: { in: COURIER_DONE },
          courierMarkedDeliveredAt: { gte: since },
          order: { paymentMethod: PaymentMethod.COD },
        },
        select: { order: { select: { totalAmount: true } } },
      }),
      this.prisma.delivery.count({
        where: { courierId, status: { in: COURIER_DONE } },
      }),
    ]);

    return {
      availableTasks: available,
      activeTasks: active,
      deliveredToday: doneToday,
      deliveredTotal: doneAll,
      codCollectedToday: codRows.reduce(
        (sum, r) => sum + Number(r.order.totalAmount),
        0,
      ),
    };
  }

  // ── Tindakan ─────────────────────────────────────────────────

  /**
   * Mengambil tugas dari kumpulan terbuka.
   *
   * `updateMany` dengan `courierId: null` di WHERE, bukan baca-lalu-tulis:
   * dua kurir yang menekan "Ambil Tugas" pada detik yang sama akan membuat
   * salah satunya menulis di atas yang lain, dan dua orang berangkat untuk
   * satu paket. Di sini yang kalah mendapat pesan, bukan perjalanan sia-sia.
   */
  async claim(deliveryId: string, courierId: string) {
    const kopdesId = await this.kopdesOf(courierId);

    const target = await this.prisma.delivery.findFirst({
      where: {
        id: deliveryId,
        order: {
          items: {
            some: {
              OR: [
                { product: { kopdesId } },
                { umkmProduct: { umkm: { kopdesId } } },
              ],
            },
          },
        },
      },
      select: { id: true, courierId: true, orderId: true },
    });
    if (!target) {
      throw new NotFoundException(
        'Tugas ini bukan milik Kopdes tempat Anda bertugas',
      );
    }

    const { count } = await this.prisma.delivery.updateMany({
      where: { id: deliveryId, courierId: null },
      data: {
        courierId,
        status: DeliveryStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
    });
    if (count === 0) {
      throw new BadRequestException(
        'Tugas ini baru saja diambil kurir lain. Muat ulang daftarnya.',
      );
    }

    await this.audit(courierId, 'COURIER_CLAIM', deliveryId, target.orderId);
    return this.detail(deliveryId, courierId);
  }

  /** Menerima tugas yang ditugaskan pengurus (ASSIGNED → ACCEPTED). */
  async accept(deliveryId: string, courierId: string) {
    const row = await this.mine(deliveryId, courierId);
    if (row.status !== DeliveryStatus.ASSIGNED) {
      throw new BadRequestException('Tugas ini sudah Anda terima sebelumnya');
    }
    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.ACCEPTED, acceptedAt: new Date() },
    });
    await this.audit(courierId, 'COURIER_ACCEPT', deliveryId, row.orderId);
    return this.detail(deliveryId, courierId);
  }

  /**
   * Melepas tugas kembali ke kumpulan.
   *
   * Hanya sebelum barang diambil. Setelah `PICKED_UP` barangnya ada di tangan
   * kurir, dan melepasnya di sistem tidak memindahkan barangnya — yang
   * tersisa hanya catatan yang tidak cocok dengan kenyataan.
   */
  async release(deliveryId: string, courierId: string, reason?: string) {
    const row = await this.mine(deliveryId, courierId);
    if (!RELEASABLE.includes(row.status)) {
      throw new BadRequestException(
        'Barang sudah Anda ambil. Hubungi pengurus Kopdes bila tidak bisa melanjutkan.',
      );
    }
    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        courierId: null,
        status: DeliveryStatus.ASSIGNED,
        acceptedAt: null,
      },
    });
    await this.audit(
      courierId,
      'COURIER_RELEASE',
      deliveryId,
      row.orderId,
      reason,
    );
    return { released: true };
  }

  /**
   * Barang diambil dari toko. Inilah yang memberangkatkan pesanan.
   *
   * Pesanan pindah ke OUT_FOR_DELIVERY di sini, bukan saat kurir mengambil
   * tugas: sebelum barangnya benar-benar keluar toko, "dalam pengiriman"
   * adalah kabar yang belum benar bagi pemesan yang menungguinya.
   */
  async markPickedUp(deliveryId: string, courierId: string) {
    const row = await this.mine(deliveryId, courierId);
    if (row.status === DeliveryStatus.ASSIGNED) {
      throw new BadRequestException('Terima tugasnya lebih dulu');
    }
    if (row.status !== DeliveryStatus.ACCEPTED) {
      throw new BadRequestException('Barang pesanan ini sudah Anda ambil');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: deliveryId },
        data: { status: DeliveryStatus.PICKED_UP, pickedUpAt: new Date() },
      });
      await tx.order.updateMany({
        where: {
          id: row.orderId,
          status: {
            in: [OrderStatus.READY_FOR_DELIVERY, OrderStatus.PROCESSING],
          },
        },
        data: { status: OrderStatus.OUT_FOR_DELIVERY },
      });
    });

    await this.audit(courierId, 'COURIER_PICKED_UP', deliveryId, row.orderId);
    return this.detail(deliveryId, courierId);
  }

  // ── Bantu ────────────────────────────────────────────────────

  private async mine(deliveryId: string, courierId: string) {
    const row = await this.prisma.delivery.findFirst({
      where: { id: deliveryId, courierId },
      select: { id: true, status: true, orderId: true },
    });
    if (!row) {
      throw new NotFoundException('Tugas ini tidak ditugaskan kepada Anda');
    }
    return row;
  }

  private async audit(
    userId: string,
    action: string,
    deliveryId: string,
    orderId: string,
    note?: string,
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId,
        action,
        details: JSON.stringify({
          deliveryId,
          orderId,
          ...(note ? { note } : {}),
        }),
      },
    });
  }

  /** Peran pemanggil dipastikan kurir sebelum apa pun dibaca. */
  static assertCourier(role: Role) {
    if (role !== Role.COURIER) {
      throw new ForbiddenException('Halaman ini hanya untuk akun kurir');
    }
  }
}
