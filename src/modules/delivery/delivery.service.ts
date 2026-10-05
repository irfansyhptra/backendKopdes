import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DeliveryStatus, Prisma, Role } from '@prisma/client';

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kurir milik satu Kopdes, beserta beban pengantaran aktifnya.
   *
   * Disaring `kopdesId`. Sebelumnya daftar ini global: setiap koperasi
   * melihat kurir koperasi lain dan bisa menugaskannya mengantar pesanan
   * desanya sendiri.
   *
   * Kurir tanpa penugasan Kopdes tidak muncul di mana pun — itu memang
   * keadaan yang harus diperbaiki Super Admin, bukan disamarkan dengan
   * menampilkannya ke semua desa.
   */
  async listCouriers(kopdesId: string | null = null) {
    const activeStatuses: DeliveryStatus[] = [
      DeliveryStatus.ASSIGNED,
      DeliveryStatus.ACCEPTED,
      DeliveryStatus.PICKED_UP,
      DeliveryStatus.IN_TRANSIT,
      DeliveryStatus.COURIER_DELIVERED,
    ];

    const couriers = await this.prisma.user.findMany({
      where: { role: Role.COURIER, ...(kopdesId ? { kopdesId } : {}) },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: 'asc' },
    });

    // Hitung beban aktif per kurir.
    const withLoad = await Promise.all(
      couriers.map(async (c) => {
        const activeCount = await this.prisma.delivery.count({
          where: { courierId: c.id, status: { in: activeStatuses } },
        });
        return { ...c, activeCount };
      }),
    );

    return withLoad;
  }

  /**
   * Pengantaran milik satu Kopdes, ditelusuri lewat baris pesanannya —
   * `Delivery` sendiri tidak menyimpan kopdesId.
   */
  static kopdesScope(kopdesId: string | null): Prisma.DeliveryWhereInput {
    if (!kopdesId) return {};
    return {
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
    };
  }

  private async assertScope(deliveryId: string, kopdesId: string | null) {
    if (!kopdesId) return;
    const owned = await this.prisma.delivery.findFirst({
      where: { id: deliveryId, ...DeliveryService.kopdesScope(kopdesId) },
      select: { id: true },
    });
    if (!owned) {
      throw new ForbiddenException(
        'Pengantaran ini bukan milik Kopdes tempat Anda bertugas',
      );
    }
  }

  async listDeliveries(
    status?: DeliveryStatus,
    kopdesId: string | null = null,
  ) {
    const where: Prisma.DeliveryWhereInput = {
      ...DeliveryService.kopdesScope(kopdesId),
      ...(status ? { status } : {}),
    };

    return this.prisma.delivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        courier: { select: { id: true, name: true, phone: true } },
        order: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            deliveryAddress: true,
          },
        },
      },
    });
  }

  /** Status setelah barang berpindah tangan — penugasan tidak boleh diubah lagi. */
  private static readonly LOCKED_STATUSES: DeliveryStatus[] = [
    DeliveryStatus.PICKED_UP,
    DeliveryStatus.IN_TRANSIT,
    DeliveryStatus.COURIER_DELIVERED,
    DeliveryStatus.CUSTOMER_CONFIRMED,
    DeliveryStatus.COMPLETED,
  ];

  async assignCourier(
    deliveryId: string,
    courierId: string,
    actor?: { id: string; kopdesId: string | null },
  ) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery)
      throw new NotFoundException(`Pengantaran ${deliveryId} tidak ditemukan`);
    await this.assertScope(deliveryId, actor?.kopdesId ?? null);

    // Mengganti kurir setelah barang diambil membuat riwayat pengantaran
    // berbohong: yang membawa barang bukan yang tercatat.
    if (DeliveryService.LOCKED_STATUSES.includes(delivery.status)) {
      throw new BadRequestException(
        `Pengantaran berstatus ${delivery.status} tidak bisa dialihkan kurirnya`,
      );
    }

    const courier = await this.prisma.user.findUnique({
      where: { id: courierId },
      select: { id: true, role: true, kopdesId: true },
    });
    if (!courier || courier.role !== Role.COURIER) {
      throw new BadRequestException('Kurir tidak valid');
    }

    // Kurir desa lain tidak boleh ditugasi, bahkan bila id-nya ditebak
    // benar. Tanpa penjagaan ini, menyaring daftar kurir di layar hanya
    // menyembunyikan pilihannya — permintaan langsung tetap lolos.
    if (actor?.kopdesId && courier.kopdesId !== actor.kopdesId) {
      throw new ForbiddenException(
        'Kurir ini bukan kurir Kopdes tempat Anda bertugas',
      );
    }

    const updated = await this.prisma.delivery.update({
      where: { id: deliveryId },
      // Penugasan dari pengurus berhenti di ASSIGNED: kurirnya belum tentu
      // tahu, apalagi menyanggupi. Ia menerimanya sendiri di aplikasi kurir.
      data: { courierId, status: DeliveryStatus.ASSIGNED, acceptedAt: null },
      include: {
        courier: { select: { id: true, name: true, phone: true } },
        order: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            deliveryAddress: true,
          },
        },
      },
    });

    await this.writeAudit(actor?.id, 'DELIVERY_ASSIGN', {
      deliveryId,
      before: { courierId: delivery.courierId, status: delivery.status },
      after: { courierId, status: DeliveryStatus.ASSIGNED },
    });

    return updated;
  }

  /**
   * Melepas kurir dari sebuah pengantaran.
   *
   * Hanya sebelum barang diambil. Setelah `PICKED_UP` barang sudah ada di
   * tangan kurir, dan melepas penugasannya di sistem tidak mengembalikan
   * barangnya — yang tersisa hanya catatan yang tidak cocok dengan kenyataan.
   */
  async unassignCourier(
    deliveryId: string,
    actor?: { id: string; kopdesId: string | null },
  ) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery)
      throw new NotFoundException(`Pengantaran ${deliveryId} tidak ditemukan`);
    await this.assertScope(deliveryId, actor?.kopdesId ?? null);

    if (DeliveryService.LOCKED_STATUSES.includes(delivery.status)) {
      throw new BadRequestException(
        'Penugasan hanya bisa dibatalkan sebelum barang diambil kurir',
      );
    }
    if (!delivery.courierId) {
      throw new BadRequestException('Pengantaran ini belum punya kurir');
    }

    const updated = await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        courierId: null,
        status: DeliveryStatus.ASSIGNED,
        acceptedAt: null,
      },
      include: {
        order: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            deliveryAddress: true,
          },
        },
      },
    });

    await this.writeAudit(actor?.id, 'DELIVERY_UNASSIGN', {
      deliveryId,
      before: { courierId: delivery.courierId, status: delivery.status },
      after: { courierId: null },
    });

    return updated;
  }

  private async writeAudit(
    actorId: string | undefined,
    action: string,
    details: unknown,
  ) {
    if (!actorId) return;
    await this.prisma.auditLog
      .create({
        data: { userId: actorId, action, details: JSON.stringify(details) },
      })
      .catch(() => undefined);
  }

  // 1. Get list of deliveries assigned to specific Courier
  async getCourierDeliveries(courierId: string) {
    return this.prisma.delivery.findMany({
      where: { courierId },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            deliveryAddress: true,
            items: {
              include: {
                product: { select: { name: true } },
                umkmProduct: { select: { name: true } },
              },
            },
          },
        },
        locations: {
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  // 2. Dual Validation Step 1: Kurir marks "[Barang Sudah Diantar]"
  async markCourierDelivered(
    deliveryId: string,
    courierId: string,
    /** Posisi kurir saat menekan tombol. Null bila GPS-nya mati. */
    at?: { latitude: number; longitude: number },
  ) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: true },
    });

    if (!delivery) {
      throw new NotFoundException(`Pengantaran ${deliveryId} tidak ditemukan`);
    }

    if (delivery.courierId !== courierId) {
      throw new BadRequestException(
        'Pengantaran ini tidak ditugaskan kepada Anda',
      );
    }

    // Barang yang belum diambil tidak mungkin sudah diantar. Tanpa syarat
    // ini satu ketukan bisa melompati pengambilan barang, dan pesanan COD
    // tercatat terkirim tanpa pernah meninggalkan toko.
    if (
      delivery.status !== DeliveryStatus.PICKED_UP &&
      delivery.status !== DeliveryStatus.IN_TRANSIT
    ) {
      throw new BadRequestException(
        delivery.status === DeliveryStatus.ASSIGNED ||
          delivery.status === DeliveryStatus.ACCEPTED
          ? 'Tandai "Barang Diambil" lebih dulu'
          : 'Pengantaran ini sudah ditandai selesai',
      );
    }

    const now = new Date();
    const updatedDelivery = await this.prisma.$transaction(async (tx) => {
      const del = await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.COURIER_DELIVERED,
          courierMarkedDeliveredAt: now,
          actualDeliveryTime: now,
          deliveredLatitude: at?.latitude ?? null,
          deliveredLongitude: at?.longitude ?? null,
        },
        include: {
          order: {
            include: { customer: { select: { id: true, name: true } } },
          },
        },
      });

      // Update Order Status to DELIVERED
      await tx.order.update({
        where: { id: delivery.orderId },
        data: { status: 'DELIVERED' },
      });

      // Send notification to customer
      await tx.notification.create({
        data: {
          userId: delivery.order.customerId,
          title: 'Pesanan Telah Diantar Kurir',
          message: `Kurir telah mengantarkan pesanan #${delivery.orderId.substring(0, 8)}. Silakan periksa barang Anda dan klik [Barang Sudah Diterima] untuk menyelesaikan transaksi.`,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: courierId,
          action: 'DUAL_VALIDATION_COURIER_DELIVERED',
          details: `Kurir menandai barang sudah diantar untuk Delivery #${deliveryId} (Order #${delivery.orderId})`,
        },
      });

      return del;
    });

    return updatedDelivery;
  }

  // 3. Dual Validation Step 2: Customer confirms "[Barang Sudah Diterima]"
  async customerConfirmDelivery(orderId: string, customerId: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { orderId },
      include: { order: true },
    });

    if (!delivery) {
      throw new NotFoundException(
        `Data pengiriman untuk Order ${orderId} tidak ditemukan`,
      );
    }

    if (delivery.order.customerId !== customerId) {
      throw new BadRequestException('Pesanan ini bukan milik Anda');
    }
    // Sama dengan `OrderService.confirmCustomerDelivery`: hanya setelah
    // kurir menandai barang sampai.
    if (delivery.order.status !== 'DELIVERED') {
      throw new BadRequestException(
        'Konfirmasi penerimaan baru bisa setelah kurir menandai barang sampai.',
      );
    }

    const now = new Date();
    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // Update Delivery status to CUSTOMER_CONFIRMED & COMPLETED
      await tx.delivery.update({
        where: { id: delivery.id },
        data: {
          status: DeliveryStatus.COMPLETED,
          customerConfirmedAt: now,
        },
      });

      // Update Order status to COMPLETED
      const ord = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          paymentStatus:
            delivery.order.paymentMethod === 'COD'
              ? 'PAID'
              : delivery.order.paymentStatus,
        },
      });

      // Update Payment if COD
      if (delivery.order.paymentMethod === 'COD') {
        await tx.payment.updateMany({
          where: { orderId },
          data: { status: 'PAID', paidAt: now },
        });
      }

      // Audit Log for Complete Dual Validation Trail
      await tx.auditLog.create({
        data: {
          userId: customerId,
          action: 'DUAL_VALIDATION_CUSTOMER_CONFIRMED',
          details: `Customer mengonfirmasi penerimaan barang untuk Order #${orderId}. Transaksi pengiriman SELESAI.`,
        },
      });

      return ord;
    });

    return updatedOrder;
  }

  // 4. Track Kurir GPS location
  /**
   * Posisi kurir untuk satu pesanan, dibaca pelanggannya.
   *
   * Kurir sudah mengirim koordinat sejak awal, tetapi tidak ada satu pun
   * jalur untuk membacanya — jadi "live tracking" berhenti di tabel. Ini
   * pasangan bacanya.
   *
   * Yang boleh melihat: pemilik pesanan, pengurus Kopdes asal pesanan, dan
   * kurir yang ditugaskan. Selain itu 404, bukan 403: keberadaan pesanan
   * orang lain pun bukan urusannya.
   *
   * Yang dikirim hanya titik terakhir beserta waktunya, bukan seluruh jejak.
   * Riwayat lengkap perjalanan kurir adalah data pergerakan seseorang, dan
   * pelanggan tidak membutuhkannya untuk tahu pesanannya di mana.
   */
  async getTrackingForOrder(
    orderId: string,
    user: { id: string; role: Role; kopdesId: string | null },
  ) {
    const isStaff =
      user.role === Role.ADMIN_KOPDES || user.role === Role.PEGAWAI_KOPDES;

    // `Order` tidak menyimpan kopdesId sendiri; kepemilikan desanya
    // ditelusuri lewat barisnya, sama seperti `OrderService.kopdesScope`.
    // Dipakai sebagai bagian dari WHERE, bukan diperiksa setelahnya, supaya
    // pesanan desa lain tidak pernah terbaca sekalipun sesaat.
    const kopdesScope: Prisma.OrderWhereInput =
      isStaff && user.kopdesId
        ? {
            items: {
              some: {
                OR: [
                  { product: { kopdesId: user.kopdesId } },
                  { umkmProduct: { umkm: { kopdesId: user.kopdesId } } },
                ],
              },
            },
          }
        : {};

    const delivery = await this.prisma.delivery.findFirst({
      where: {
        orderId,
        // Super Admin lintas desa; selain itu harus punya hubungan dengan
        // pesanannya — pemilik, kurir yang ditugaskan, atau pengurus desanya.
        ...(user.role === Role.SUPER_ADMIN
          ? {}
          : {
              OR: [
                { order: { customerId: user.id } },
                { courierId: user.id },
                ...(isStaff && user.kopdesId ? [{ order: kopdesScope }] : []),
              ],
            }),
      },
      select: {
        id: true,
        status: true,
        courierId: true,
        courierMarkedDeliveredAt: true,
        customerConfirmedAt: true,
        estimatedDeliveryTime: true,
        actualDeliveryTime: true,
        courier: { select: { id: true, name: true, phone: true } },
        order: {
          select: {
            id: true,
            deliveryAddress: {
              select: {
                title: true,
                recipientName: true,
                street: true,
                city: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
        locations: {
          orderBy: { recordedAt: 'desc' },
          take: 1,
          select: { latitude: true, longitude: true, recordedAt: true },
        },
      },
    });

    // 404, bukan 403: keberadaan pesanan orang lain pun bukan urusannya.
    if (!delivery) {
      throw new NotFoundException('Pengantaran tidak ditemukan.');
    }

    const order = delivery.order;

    const last = delivery.locations[0] ?? null;

    return {
      deliveryId: delivery.id,
      orderId: order.id,
      status: delivery.status,
      courier: delivery.courier,
      estimatedDeliveryTime: delivery.estimatedDeliveryTime,
      actualDeliveryTime: delivery.actualDeliveryTime,
      courierMarkedDeliveredAt: delivery.courierMarkedDeliveredAt,
      customerConfirmedAt: delivery.customerConfirmedAt,
      /// Tujuan pengantaran sebagai teks.
      ///
      /// `Address` belum menyimpan koordinat, jadi klien tidak bisa menggambar
      /// garis kurir→tujuan maupun memvalidasi jarak saat penerimaan — padahal
      /// itulah yang dijanjikan "delivery dual-validation". Menambah
      /// lat/lng ke alamat adalah pekerjaan tersendiri.
      destination: order.deliveryAddress,
      /// `null` berarti kurir belum mengirim posisi sama sekali — berbeda
      /// dari koordinat 0,0 yang akan menaruhnya di Teluk Guinea.
      lastLocation: last,
    };
  }

  async updateCourierLocation(
    deliveryId: string,
    courierId: string,
    latitude: number,
    longitude: number,
  ) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      throw new NotFoundException(`Pengantaran ${deliveryId} tidak ditemukan`);
    }

    if (delivery.courierId !== courierId) {
      throw new BadRequestException(
        'Anda bukan kurir penanggung jawab pengiriman ini',
      );
    }

    // Titik pertama setelah barang diambil membuktikan kurirnya bergerak,
    // jadi IN_TRANSIT dinaikkan di sini — bukan lewat tombol tersendiri yang
    // harus diingat kurir sambil berkendara.
    if (delivery.status === DeliveryStatus.PICKED_UP) {
      await this.prisma.delivery.update({
        where: { id: deliveryId },
        data: { status: DeliveryStatus.IN_TRANSIT },
      });
    }

    return this.prisma.deliveryLocation.create({
      data: {
        deliveryId,
        latitude,
        longitude,
        recordedAt: new Date(),
      },
    });
  }
}
