import { ForbiddenException } from '@nestjs/common';
import { OrderService } from './order.service';

// Fokus spec ini hanya pada penjagaan akses updateStatus() dan getTimeline().
describe('OrderService — authorization', () => {
  const OWNER = 'customer-1';
  const STRANGER = 'customer-2';

  let prisma: any;
  let cache: any;
  let service: OrderService;

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
      order: { findUnique: jest.fn() },
      auditLog: { create: jest.fn(), findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    cache = {
      get: jest.fn(async () => null),
      set: jest.fn(),
      delete: jest.fn(),
    };

    // updateStatus & getTimeline tidak menyentuh alamat.
    service = new OrderService(prisma, cache, {} as any);
  });

  describe('updateStatus', () => {
    it('menolak pengguna lain mengubah status pesanan orang', async () => {
      prisma.order.findUnique.mockResolvedValue(order());

      await expect(
        service.updateStatus(STRANGER, 'order-1', 'PROCESSING' as any, 'CUSTOMER'),
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
      prisma.order.findUnique.mockResolvedValue(order({ status: 'PROCESSING' }));

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
});
