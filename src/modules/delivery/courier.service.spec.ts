import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CourierService } from './courier.service';

const COURIER = 'kurir-1';

function build() {
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ kopdesId: 'kop-1' })) },
    delivery: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(),
      count: jest.fn(async () => 0),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    order: { updateMany: jest.fn(async () => ({ count: 1 })) },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(async (arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    ),
  };
  return { prisma, service: new CourierService(prisma) };
}

/** Satu baris pengantaran selengkap yang dibaca `toTask`. */
const row = ({ order: orderOver, ...over }: any = {}) => ({
  id: 'd1',
  status: 'ACCEPTED',
  acceptedAt: null,
  pickedUpAt: null,
  courierMarkedDeliveredAt: null,
  customerConfirmedAt: null,
  createdAt: new Date(),
  order: {
    id: 'o1',
    status: 'READY_FOR_DELIVERY',
    createdAt: new Date(),
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    totalAmount: { toString: () => '95000' },
    shippingFee: { toString: () => '5000' },
    customer: { id: 'c1', name: 'Ahmad', phone: '0812' },
    deliveryAddress: {
      title: 'Rumah',
      recipientName: 'Ahmad',
      phone: '0812',
      street: 'Jl. Lamteh 4',
      city: 'Banda Aceh',
      latitude: 5.5,
      longitude: 95.3,
    },
    items: [
      {
        quantity: 2,
        variantName: null,
        product: {
          name: 'Beras',
          kopdes: {
            id: 'kop-1',
            name: 'Kopdes Lamteh',
            address: 'Jl. Utama',
            phone: '0651',
            latitude: 5.6,
            longitude: 95.2,
          },
        },
        umkmProduct: null,
      },
    ],
    ...orderOver,
  },
  ...over,
});

describe('CourierService', () => {
  describe('cakupan Kopdes', () => {
    it('kurir tanpa Kopdes tidak melihat tugas siapa pun', async () => {
      const { prisma, service } = build();
      prisma.user.findUnique.mockResolvedValue({ kopdesId: null });

      await expect(service.availableTasks(COURIER)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.delivery.findMany).not.toHaveBeenCalled();
    });

    it('tugas tersedia: tanpa kurir, barang siap, dan hanya desa sendiri', async () => {
      const { prisma, service } = build();
      await service.availableTasks(COURIER);

      const where = prisma.delivery.findMany.mock.calls[0][0].where;
      expect(where.courierId).toBeNull();
      expect(where.order.status).toBe('READY_FOR_DELIVERY');
      expect(where.order.items.some.OR).toEqual([
        { product: { kopdesId: 'kop-1' } },
        { umkmProduct: { umkm: { kopdesId: 'kop-1' } } },
      ]);
      // Yang menunggu paling lama didahulukan.
      expect(prisma.delivery.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'asc',
      });
    });
  });

  describe('mengambil tugas', () => {
    it('klaim memakai syarat courierId null, bukan baca lalu tulis', async () => {
      const { prisma, service } = build();
      prisma.delivery.findFirst
        .mockResolvedValueOnce({ id: 'd1', courierId: null, orderId: 'o1' })
        .mockResolvedValueOnce(row());

      await service.claim('d1', COURIER);

      const call = prisma.delivery.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'd1', courierId: null });
      expect(call.data).toMatchObject({
        courierId: COURIER,
        status: 'ACCEPTED',
      });
    });

    it('kalah cepat dari kurir lain: ditolak dengan pesan, bukan ditimpa', async () => {
      const { prisma, service } = build();
      prisma.delivery.findFirst.mockResolvedValue({
        id: 'd1',
        courierId: null,
        orderId: 'o1',
      });
      prisma.delivery.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.claim('d1', COURIER)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('tugas desa lain tidak bisa diambil', async () => {
      const { prisma, service } = build();
      prisma.delivery.findFirst.mockResolvedValue(null);

      await expect(service.claim('d1', COURIER)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.delivery.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('ambil barang', () => {
    it('ACCEPTED → PICKED_UP dan pesanan berangkat', async () => {
      const { prisma, service } = build();
      prisma.delivery.findFirst
        .mockResolvedValueOnce({ id: 'd1', status: 'ACCEPTED', orderId: 'o1' })
        .mockResolvedValueOnce(row({ status: 'PICKED_UP' }));

      await service.markPickedUp('d1', COURIER);

      expect(prisma.delivery.update.mock.calls[0][0].data).toMatchObject({
        status: 'PICKED_UP',
      });
      expect(prisma.order.updateMany.mock.calls[0][0].data).toEqual({
        status: 'OUT_FOR_DELIVERY',
      });
    });

    it('tugas yang belum diterima tidak bisa langsung diambil barangnya', async () => {
      const { prisma, service } = build();
      prisma.delivery.findFirst.mockResolvedValue({
        id: 'd1',
        status: 'ASSIGNED',
        orderId: 'o1',
      });

      await expect(service.markPickedUp('d1', COURIER)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('melepas tugas', () => {
    it('boleh sebelum barang diambil — kembali ke kumpulan', async () => {
      const { prisma, service } = build();
      prisma.delivery.findFirst.mockResolvedValue({
        id: 'd1',
        status: 'ACCEPTED',
        orderId: 'o1',
      });

      await service.release('d1', COURIER, 'ban bocor');

      expect(prisma.delivery.update.mock.calls[0][0].data).toEqual({
        courierId: null,
        status: 'ASSIGNED',
        acceptedAt: null,
      });
    });

    it('barang sudah di tangan: tidak bisa dilepas begitu saja', async () => {
      const { prisma, service } = build();
      prisma.delivery.findFirst.mockResolvedValue({
        id: 'd1',
        status: 'PICKED_UP',
        orderId: 'o1',
      });

      await expect(service.release('d1', COURIER)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.delivery.update).not.toHaveBeenCalled();
    });
  });

  describe('dasbor', () => {
    it('"hari ini" mulai tengah malam WIB, COD dijumlahkan', async () => {
      const { prisma, service } = build();
      prisma.delivery.findMany.mockResolvedValue([
        { order: { totalAmount: { toString: () => '95000' } } },
        { order: { totalAmount: { toString: () => '5000' } } },
      ]);

      // 01.30 WIB tanggal 5 = 18.30 UTC tanggal 4.
      const res = await service.summary(
        COURIER,
        new Date('2026-10-04T18:30:00Z'),
      );

      const since =
        prisma.delivery.count.mock.calls[2][0].where.courierMarkedDeliveredAt
          .gte;
      expect(since.toISOString()).toBe('2026-10-04T17:00:00.000Z');
      expect(res.codCollectedToday).toBe(100000);
    });
  });

  describe('bentuk yang dibaca aplikasi', () => {
    it('COD belum lunas: nominal tagihan ikut; sudah lunas: nol', async () => {
      const { prisma, service } = build();
      prisma.delivery.findFirst.mockResolvedValue(row());
      const cod = await service.detail('d1', COURIER);
      expect(cod.order.codAmount).toBe(95000);
      expect(cod.pickups).toEqual([
        {
          id: 'kop-1',
          kind: 'KOPDES',
          name: 'Kopdes Lamteh',
          address: 'Jl. Utama',
          phone: '0651',
          latitude: 5.6,
          longitude: 95.2,
        },
      ]);
      expect(cod.itemCount).toBe(2);

      prisma.delivery.findFirst.mockResolvedValue(
        row({ order: { paymentStatus: 'PAID' } }),
      );
      const paid = await service.detail('d1', COURIER);
      expect(paid.order.codAmount).toBe(0);
    });

    it('tugas yang bukan miliknya tidak terbaca', async () => {
      const { prisma, service } = build();
      prisma.delivery.findFirst.mockResolvedValue(null);
      await expect(service.detail('d1', COURIER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
