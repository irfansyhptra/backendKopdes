import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderService } from './order.service';

// Fokus spec ini hanya pada penjagaan akses updateStatus() dan getTimeline().
describe('OrderService — authorization', () => {
  const OWNER = 'customer-1';
  const STRANGER = 'customer-2';

  let prisma: any;
  let cache: any;
  let service: OrderService;
  let wallet: any;

  const order = (overrides: any = {}) => ({
    id: 'order-1',
    customerId: OWNER,
    status: 'PENDING',
    paymentMethod: 'COD',
    items: [],
    ...overrides,
  });

  beforeEach(() => {
    const tx = {
      order: { update: jest.fn(async (a: any) => ({ id: a.where.id })) },
      payment: { update: jest.fn(), updateMany: jest.fn() },
      product: { update: jest.fn() },
      uMKMProduct: { update: jest.fn() },
      inventoryTransaction: { create: jest.fn() },
    };

    prisma = {
      order: { findUnique: jest.fn(), findFirst: jest.fn() },
      auditLog: { create: jest.fn(), findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    cache = {
      get: jest.fn(async () => null),
      set: jest.fn(),
      delete: jest.fn(),
      // Riwayat kini di-cache per halaman, jadi invalidasinya memakai pola.
      deletePattern: jest.fn(),
    };

    // updateStatus & getTimeline tidak menyentuh alamat.
    wallet = { debitForOrder: jest.fn(), refundOrder: jest.fn() };
    service = new OrderService(prisma, cache, {} as any, wallet);
  });

  describe('updateStatus', () => {
    it('menolak pengguna lain mengubah status pesanan orang', async () => {
      prisma.order.findUnique.mockResolvedValue(order());

      await expect(
        service.updateStatus(
          STRANGER,
          'order-1',
          'PROCESSING' as any,
          'CUSTOMER',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('menolak pemilik menandai pesanannya sendiri PAID', async () => {
      prisma.order.findUnique.mockResolvedValue(order());

      await expect(
        service.updateStatus(OWNER, 'order-1', 'PAID' as any, 'CUSTOMER'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('menolak pembatalan setelah pesanan diproses', async () => {
      prisma.order.findUnique.mockResolvedValue(
        order({ status: 'PROCESSING' }),
      );

      await expect(
        service.updateStatus(OWNER, 'order-1', 'CANCELLED' as any, 'CUSTOMER'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('mengizinkan pemilik membatalkan pesanannya yang masih PENDING', async () => {
      prisma.order.findUnique.mockResolvedValue(order());

      await expect(
        service.updateStatus(OWNER, 'order-1', 'CANCELLED' as any, 'CUSTOMER'),
      ).resolves.toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it.each(['ADMIN_KOPDES', 'PEGAWAI_KOPDES', 'SUPER_ADMIN'])(
      'mengizinkan %s menggerakkan status pesanan siapa pun',
      async (role) => {
        prisma.order.findUnique.mockResolvedValue(order());

        await expect(
          service.updateStatus('staff-1', 'order-1', 'PAID' as any, role),
        ).resolves.toBeDefined();
        expect(prisma.$transaction).toHaveBeenCalled();
      },
    );
  });

  describe('updateStatus — transisi & lingkup Kopdes', () => {
    it('menolak lompatan status yang melewati tahap kerja', async () => {
      prisma.order.findUnique.mockResolvedValue(order());

      await expect(
        service.updateStatus(
          'staff-1',
          'order-1',
          'COMPLETED' as any,
          'PEGAWAI_KOPDES',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('menolak perubahan pada pesanan yang sudah final', async () => {
      prisma.order.findUnique.mockResolvedValue(order({ status: 'COMPLETED' }));

      await expect(
        service.updateStatus(
          'staff-1',
          'order-1',
          'PROCESSING' as any,
          'ADMIN_KOPDES',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('menolak pegawai menyentuh pesanan Kopdes lain', async () => {
      prisma.order.findUnique.mockResolvedValue(order());
      prisma.order.findFirst.mockResolvedValue(null); // bukan milik desanya

      await expect(
        service.updateStatus(
          'staff-1',
          'order-1',
          'PROCESSING' as any,
          'PEGAWAI_KOPDES',
          'kop-lain',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('mengizinkan pegawai memproses pesanan desanya sendiri', async () => {
      prisma.order.findUnique.mockResolvedValue(order());
      prisma.order.findFirst.mockResolvedValue({ id: 'order-1' });

      await expect(
        service.updateStatus(
          'staff-1',
          'order-1',
          'PROCESSING' as any,
          'PEGAWAI_KOPDES',
          'kop-1',
        ),
      ).resolves.toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('getTimeline', () => {
    it('menolak pengguna yang bukan pemilik pesanan', async () => {
      prisma.order.findUnique.mockResolvedValue(order());

      await expect(
        service.getTimeline(STRANGER, 'order-1', 'CUSTOMER'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it('mengizinkan pemilik membaca timeline pesanannya', async () => {
      prisma.order.findUnique.mockResolvedValue(order());

      await expect(
        service.getTimeline(OWNER, 'order-1', 'CUSTOMER'),
      ).resolves.toEqual([]);
      expect(prisma.auditLog.findMany).toHaveBeenCalled();
    });
  });

  describe('bayar pakai saldo', () => {
    it('dibatalkan setelah dibayar saldo → saldo dikembalikan', async () => {
      prisma.order.findUnique.mockResolvedValue(
        order({
          status: 'PAID',
          paymentMethod: 'WALLET',
          paymentStatus: 'PAID',
          totalAmount: 25000,
        }),
      );
      await service.updateStatus(
        'admin-1',
        'order-1',
        'CANCELLED' as any,
        'SUPER_ADMIN',
      );
      expect(wallet.refundOrder).toHaveBeenCalledWith(
        expect.anything(),
        OWNER,
        'order-1',
        25000,
        expect.any(String),
      );
    });

    it('pesanan COD yang batal tidak menyentuh saldo', async () => {
      prisma.order.findUnique.mockResolvedValue(order({ status: 'PENDING' }));
      await service.updateStatus(
        OWNER,
        'order-1',
        'CANCELLED' as any,
        'CUSTOMER',
      );
      expect(wallet.refundOrder).not.toHaveBeenCalled();
    });

    it('saldo dipotong lalu pesanan & pembayaran ditandai lunas', async () => {
      const tx = {
        payment: { update: jest.fn() },
        order: { update: jest.fn() },
      };
      const o = { id: 'order-9', status: 'PENDING', paymentStatus: 'PENDING' };
      await (service as any).settleWalletPayment(tx, OWNER, o, 30000);
      expect(wallet.debitForOrder).toHaveBeenCalledWith(
        tx,
        OWNER,
        'order-9',
        30000,
      );
      expect(tx.order.update.mock.calls[0][0].data).toEqual({
        status: 'PAID',
        paymentStatus: 'PAID',
      });
      expect(o.status).toBe('PAID');
    });

    it('saldo kurang → galat diteruskan, pesanan tidak ditandai lunas', async () => {
      wallet.debitForOrder.mockRejectedValue(
        new Error('Saldo tidak mencukupi.'),
      );
      const tx = {
        payment: { update: jest.fn() },
        order: { update: jest.fn() },
      };
      await expect(
        (service as any).settleWalletPayment(tx, OWNER, { id: 'o' }, 1),
      ).rejects.toThrow('Saldo tidak mencukupi');
      expect(tx.order.update).not.toHaveBeenCalled();
    });
  });
});
