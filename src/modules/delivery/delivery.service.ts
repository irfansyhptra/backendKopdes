import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DeliveryStatus, Role } from '@prisma/client';

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  // Daftar kuril koperasi + jumlah pengantaran aktif tiap kurir.
  async listCouriers() {
    const activeStatuses: DeliveryStatus[] = [
      DeliveryStatus.ASSIGNED,
      DeliveryStatus.ACCEPTED,
      DeliveryStatus.PICKED_UP,
      DeliveryStatus.IN_TRANSIT,
      DeliveryStatus.COURIER_DELIVERED,
    ];

    const couriers = await this.prisma.user.findMany({
      where: { role: Role.COURIER },
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

  async listDeliveries(status?: DeliveryStatus) {
    const where: any = {};
    if (status) where.status = status;

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

  async assignCourier(deliveryId: string, courierId: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) throw new NotFoundException(`Pengantaran ${deliveryId} tidak ditemukan`);

    const courier = await this.prisma.user.findUnique({ where: { id: courierId } });
    if (!courier || courier.role !== Role.COURIER) {
      throw new BadRequestException('Kurir tidak valid');
    }

    return this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { courierId, status: DeliveryStatus.ASSIGNED },
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
  async markCourierDelivered(deliveryId: string, courierId: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: true },
    });

    if (!delivery) {
      throw new NotFoundException(`Pengantaran ${deliveryId} tidak ditemukan`);
    }

    if (delivery.courierId !== courierId) {
      throw new BadRequestException('Pengantaran ini tidak ditugaskan kepada Anda');
    }

    const now = new Date();
    const updatedDelivery = await this.prisma.$transaction(async (tx) => {
      const del = await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.COURIER_DELIVERED,
          courierMarkedDeliveredAt: now,
          actualDeliveryTime: now,
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
      throw new NotFoundException(`Data pengiriman untuk Order ${orderId} tidak ditemukan`);
    }

    if (delivery.order.customerId !== customerId) {
      throw new BadRequestException('Pesanan ini bukan milik Anda');
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
          paymentStatus: delivery.order.paymentMethod === 'COD' ? 'PAID' : delivery.order.paymentStatus,
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
  async updateCourierLocation(deliveryId: string, courierId: string, latitude: number, longitude: number) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      throw new NotFoundException(`Pengantaran ${deliveryId} tidak ditemukan`);
    }

    if (delivery.courierId !== courierId) {
      throw new BadRequestException('Anda bukan kurir penanggung jawab pengiriman ini');
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

