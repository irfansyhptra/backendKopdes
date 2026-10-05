import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderService } from './order.service';

const OWNER = 'customer-1';

function build() {
  const tx: any = {
    order: { update: jest.fn(async () => ({})) },
    payment: { update: jest.fn() },
    product: { update: jest.fn(async () => ({ stock: 7 })) },
    uMKMProduct: { update: jest.fn(async () => ({ stock: 4 })) },
    inventoryTransaction: { create: jest.fn() },
  };
  const prisma: any = {
    order: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ data }: any) => ({
        id: 'order-1',
        status: 'PENDING',
        ...data,
      })),
      count: jest.fn(async () => 0),
    },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(async (arg: any) =>
      typeof arg === 'function' ? arg(tx) : Promise.all(arg),
    ),
  };
  const cache: any = { delete: jest.fn(), deletePattern: jest.fn() };
  const wallet: any = { refundOrder: jest.fn() };
  const service = new OrderService(prisma, cache, {} as any, wallet);
  return { prisma, tx, wallet, service };
}

const pending = (over: any = {}) => ({
  id: 'order-1',
  customerId: OWNER,
  status: 'PENDING',
  cancelRequestedAt: null,
  cancelDecidedAt: null,
  ...over,
});

describe('pembatalan: pemesan mengajukan, toko memutuskan', () => {
  describe('pengajuan', () => {
    it('pesanan yang belum disiapkan boleh diajukan batal', async () => {
      const { prisma, service } = build();
      prisma.order.findUnique.mockResolvedValue(pending());

      await service.requestCancellation(OWNER, 'order-1', 'Salah alamat');

      const data = prisma.order.update.mock.calls[0][0].data;
      expect(data.cancelReason).toBe('Salah alamat');
      expect(data.cancelRequestedAt).toBeInstanceOf(Date);
      // Pesanan BELUM batal — baru diajukan.
      expect(data.status).toBeUndefined();
    });

    // Setelah barang diambil dari rak dan dibungkus, membatalkan berarti
    // membongkar pekerjaan yang sudah terlanjur dilakukan.
    it('pesanan yang sudah disiapkan toko tidak bisa diajukan batal', async () => {
      const { prisma, service } = build();
      prisma.order.findUnique.mockResolvedValue(
        pending({ status: 'PROCESSING' }),
      );

      await expect(
        service.requestCancellation(OWNER, 'order-1', 'Berubah pikiran'),
      ).rejects.toThrow(/sudah mulai disiapkan/i);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('pesanan orang lain tidak bisa diajukan batal', async () => {
      const { prisma, service } = build();
      prisma.order.findUnique.mockResolvedValue(
        pending({ customerId: 'orang-lain' }),
      );

      await expect(
        service.requestCancellation(OWNER, 'order-1', 'Iseng'),
      ).rejects.toThrow(NotFoundException);
    });

    it('pengajuan kedua ditolak selama yang pertama belum dijawab', async () => {
      const { prisma, service } = build();
      prisma.order.findUnique.mockResolvedValue(
        pending({ cancelRequestedAt: new Date() }),
      );

      await expect(
        service.requestCancellation(OWNER, 'order-1', 'Lagi'),
      ).rejects.toThrow(/masih menunggu jawaban/i);
    });
  });

  describe('keputusan toko', () => {
    const requested = (over: any = {}) => ({
      id: 'order-1',
      customerId: OWNER,
      status: 'PENDING',
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      totalAmount: { toString: () => '95000' },
      cancelRequestedAt: new Date(),
      cancelDecidedAt: null,
      items: [{ productId: 'p1', umkmProductId: null, quantity: 2 }],
      ...over,
    });

    it('disetujui: pesanan batal dan stok dikembalikan', async () => {
      const { prisma, tx, service } = build();
      prisma.order.findFirst.mockResolvedValue(requested());
      (service as any).getOrderDetail = jest.fn(async () => ({
        id: 'order-1',
      }));

      await service.decideCancellation(
        { id: 'admin-1', kopdesId: 'kop-1' },
        'order-1',
        true,
      );

      expect(tx.order.update.mock.calls[0][0].data.status).toBe('CANCELLED');
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { stock: { increment: 2 } },
      });
    });

    it('ditolak: pesanan tetap berjalan, alasannya tercatat', async () => {
      const { prisma, tx, service } = build();
      prisma.order.findFirst.mockResolvedValue(requested());
      (service as any).getOrderDetail = jest.fn(async () => ({
        id: 'order-1',
      }));

      await service.decideCancellation(
        { id: 'admin-1', kopdesId: 'kop-1' },
        'order-1',
        false,
        'Barang sudah dikemas',
      );

      const data = tx.order.update.mock.calls[0][0].data;
      expect(data.status).toBeUndefined();
      expect(data.cancelRejectReason).toBe('Barang sudah dikemas');
      expect(tx.product.update).not.toHaveBeenCalled();
    });

    it('penolakan tanpa alasan ditolak — pemesan berhak tahu sebabnya', async () => {
      const { prisma, service } = build();
      prisma.order.findFirst.mockResolvedValue(requested());

      await expect(
        service.decideCancellation(
          { id: 'admin-1', kopdesId: 'kop-1' },
          'order-1',
          false,
          '   ',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('hanya pemilik barangnya yang boleh memutuskan', async () => {
      const { prisma, service } = build();
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.decideCancellation(
          { id: 'admin-1', kopdesId: 'kop-lain' },
          'order-1',
          true,
        ),
      ).rejects.toThrow(/tidak memuat barang milik Anda/i);

      const where = prisma.order.findFirst.mock.calls[0][0].where;
      expect(where.items.some.OR).toEqual([
        { product: { kopdesId: 'kop-lain' } },
      ]);
    });

    it('penjual UMKM memutuskan lewat umkmId-nya sendiri', async () => {
      const { prisma, service } = build();
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.decideCancellation(
          { id: 'u-user', umkmId: 'umkm-1' },
          'o',
          true,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(
        prisma.order.findFirst.mock.calls[0][0].where.items.some.OR,
      ).toEqual([{ umkmProduct: { umkmId: 'umkm-1' } }]);
    });

    it('tanpa pengajuan yang menunggu, tidak ada yang bisa diputus', async () => {
      const { prisma, service } = build();
      prisma.order.findFirst.mockResolvedValue(
        requested({ cancelRequestedAt: null }),
      );

      await expect(
        service.decideCancellation(
          { id: 'admin-1', kopdesId: 'kop-1' },
          'order-1',
          true,
        ),
      ).rejects.toThrow(/tidak ada pengajuan/i);
    });
  });

  describe('daftar pembatalan pemesan', () => {
    it('memuat yang diajukan maupun yang sudah batal', async () => {
      const { prisma, service } = build();
      await service.listCancellations(OWNER);

      const where = prisma.order.findMany.mock.calls[0][0].where;
      expect(where.customerId).toBe(OWNER);
      expect(where.OR).toEqual([
        { cancelRequestedAt: { not: null } },
        { status: 'CANCELLED' },
      ]);
    });
  });
});
