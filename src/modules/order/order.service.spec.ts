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
  let tx: any;

  const order = (overrides: any = {}) => ({
    id: 'order-1',
    customerId: OWNER,
    status: 'PENDING',
    paymentMethod: 'COD',
    items: [],
    ...overrides,
  });

  beforeEach(() => {
    tx = {
      order: {
        update: jest.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
        // Pesanan antar milik Kopdes kop-1, belum punya pengantaran.
        findUnique: jest.fn(async () => ({
          fulfillment: 'DELIVERY',
          delivery: null,
          items: [{ product: { kopdesId: 'kop-1' }, umkmProduct: null }],
        })),
      },
      user: {
        findMany: jest.fn(async () => [
          { id: 'kurir-sibuk', _count: { deliveries: 3 } },
          { id: 'kurir-luang', _count: { deliveries: 0 } },
        ]),
      },
      delivery: {
        upsert: jest.fn(async () => ({})),
        findUnique: jest.fn(async () => ({ courierId: 'kurir-luang' })),
      },
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

    // Pembatalan sepihak oleh pemesan ditutup: ia mengajukan, toko yang
    // memutuskan. Dua pintu ke pembatalan berarti satu di antaranya
    // melewatkan persetujuan toko.
    it('pemilik TIDAK bisa membatalkan sendiri; ia diarahkan mengajukan', async () => {
      prisma.order.findUnique.mockResolvedValue(order());

      await expect(
        service.updateStatus(OWNER, 'order-1', 'CANCELLED' as any, 'CUSTOMER'),
      ).rejects.toThrow(/Ajukan pembatalan/i);
      expect(prisma.$transaction).not.toHaveBeenCalled();
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

    it('COD: "Proses" berhenti di Diproses, belum menunggu kurir', async () => {
      prisma.order.findUnique.mockResolvedValue(order({ status: 'PENDING' }));
      prisma.order.findFirst.mockResolvedValue({ id: 'order-1' });

      const res = await service.updateStatus(
        'admin-1',
        'order-1',
        'PROCESSING' as any,
        'ADMIN_KOPDES',
        'kop-1',
      );

      // Barangnya belum dibungkus; kurir tidak boleh dipanggil dulu.
      expect(tx.delivery.upsert).not.toHaveBeenCalled();
      expect(res.status).toBe('PROCESSING');
    });

    it('"Siap Dikirim" barulah menaruhnya di kumpulan tugas kurir', async () => {
      prisma.order.findUnique.mockResolvedValue(
        order({ status: 'PROCESSING' }),
      );
      prisma.order.findFirst.mockResolvedValue({ id: 'order-1' });

      const res = await service.updateStatus(
        'admin-1',
        'order-1',
        'READY_FOR_DELIVERY' as any,
        'ADMIN_KOPDES',
        'kop-1',
      );

      // Tanpa kurir: kurir Kopdes yang mengambilnya sendiri.
      expect(tx.delivery.upsert.mock.calls[0][0].create).toEqual({
        orderId: 'order-1',
        status: 'ASSIGNED',
      });
      expect(tx.user.findMany).not.toHaveBeenCalled();
      expect(res.status).toBe('READY_FOR_DELIVERY');
    });

    it('bayar di muka: "Proses" tidak menyerahkan ke kurir', async () => {
      prisma.order.findUnique.mockResolvedValue(
        order({ status: 'PAID', paymentMethod: 'QRIS' }),
      );
      prisma.order.findFirst.mockResolvedValue({ id: 'order-1' });

      const res = await service.updateStatus(
        'admin-1',
        'order-1',
        'PROCESSING' as any,
        'ADMIN_KOPDES',
        'kop-1',
      );

      expect(tx.delivery.upsert).not.toHaveBeenCalled();
      expect(res.status).toBe('PROCESSING');
    });

    it('ambil sendiri: tidak ada kurir', async () => {
      prisma.order.findUnique.mockResolvedValue(order({ status: 'PENDING' }));
      prisma.order.findFirst.mockResolvedValue({ id: 'order-1' });
      tx.order.findUnique.mockResolvedValue({
        fulfillment: 'PICKUP',
        delivery: null,
        items: [],
      });

      const res = await service.updateStatus(
        'admin-1',
        'order-1',
        'PROCESSING' as any,
        'ADMIN_KOPDES',
        'kop-1',
      );

      expect(tx.delivery.upsert).not.toHaveBeenCalled();
      expect(res.status).toBe('PROCESSING');
    });
  });

  describe('lingkup pesanan Kopdes', () => {
    it('hanya barang Kopdes sendiri; pesanan mitra UMKM tidak termasuk', () => {
      const scope = OrderService.kopdesScope('kop-1');
      expect(scope).toEqual({
        items: { some: { product: { kopdesId: 'kop-1' } } },
      });
      expect(JSON.stringify(scope)).not.toContain('umkmProduct');
    });

    it('Super Admin tanpa Kopdes tidak disaring', () => {
      expect(OrderService.kopdesScope(null)).toEqual({});
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
      prisma.order.findFirst.mockResolvedValue({ id: 'order-1' });
      // Dibatalkan pengurus: COD belum pernah memotong saldo siapa pun.
      await service.updateStatus(
        'admin-1',
        'order-1',
        'CANCELLED' as any,
        'ADMIN_KOPDES',
        'kop-1',
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
