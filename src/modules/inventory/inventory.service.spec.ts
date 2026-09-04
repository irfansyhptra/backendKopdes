import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const MY_UMKM = 'umkm-1';
  const OTHER_UMKM = 'umkm-2';

  let prisma: any;
  let tx: any;
  let service: InventoryService;

  beforeEach(() => {
    tx = {
      product: { update: jest.fn(async () => ({ stock: 0 })) },
      uMKMProduct: { update: jest.fn(async () => ({ stock: 0 })) },
      inventoryTransaction: { create: jest.fn(async (a: any) => a.data) },
      auditLog: { create: jest.fn() },
    };

    prisma = {
      product: {
        findUnique: jest.fn(async () => ({
          id: 'prod-1',
          name: 'Beras 5kg',
          stock: 50,
        })),
      },
      uMKMProduct: {
        findUnique: jest.fn(async () => ({
          id: 'umkm-prod-1',
          name: 'Keripik Pisang',
          stock: 20,
          umkmId: MY_UMKM,
        })),
      },
      uMKM: { findUnique: jest.fn(async () => ({ id: MY_UMKM })) },
      inventoryTransaction: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    service = new InventoryService(prisma);
  });

  describe('validasi referensi produk', () => {
    it('menolak kalau tidak ada produk yang ditunjuk', async () => {
      await expect(
        service.adjustStock('u1', { type: 'IN', quantity: 1, reason: 'x' } as any, null),
      ).rejects.toThrow(BadRequestException);
    });

    it('menolak kalau dua-duanya diisi sekaligus', async () => {
      await expect(
        service.adjustStock(
          'u1',
          {
            productId: 'prod-1',
            umkmProductId: 'umkm-prod-1',
            type: 'IN',
            quantity: 1,
            reason: 'x',
          } as any,
          null,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('menolak produk yang tidak ada', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(
        service.adjustStock(
          'u1',
          { productId: 'hilang', type: 'IN', quantity: 1, reason: 'x' } as any,
          null,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('batas akses mitra UMKM', () => {
    it('mitra tidak boleh menyentuh stok produk Kopdes', async () => {
      await expect(
        service.adjustStock(
          'u1',
          { productId: 'prod-1', type: 'IN', quantity: 1, reason: 'x' } as any,
          MY_UMKM,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('mitra tidak boleh menyentuh produk toko lain', async () => {
      prisma.uMKMProduct.findUnique.mockResolvedValue({
        id: 'umkm-prod-9',
        name: 'Produk Toko Lain',
        stock: 5,
        umkmId: OTHER_UMKM,
      });

      await expect(
        service.adjustStock(
          'u1',
          { umkmProductId: 'umkm-prod-9', type: 'IN', quantity: 1, reason: 'x' } as any,
          MY_UMKM,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('staf Kopdes boleh menyentuh produk mitra', async () => {
      const res = await service.adjustStock(
        'staff-1',
        { umkmProductId: 'umkm-prod-1', type: 'IN', quantity: 5, reason: 'retur' } as any,
        null,
      );
      expect(res.currentStock).toBe(25);
    });

    it('riwayat mitra tanpa filter dibatasi ke tokonya sendiri', async () => {
      await service.listTransactions({}, MY_UMKM);
      expect(prisma.inventoryTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { umkmProduct: { umkmId: MY_UMKM } } }),
      );
    });
  });

  describe('adjustStock', () => {
    it('IN menambah stok dan mencatat transaksi', async () => {
      const res = await service.adjustStock(
        'u1',
        { productId: 'prod-1', type: 'IN', quantity: 10, reason: 'barang datang' } as any,
        null,
      );

      expect(res.previousStock).toBe(50);
      expect(res.currentStock).toBe(60);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stock: 60 },
      });
      expect(tx.inventoryTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          umkmProductId: null,
          type: 'IN',
          quantity: 10,
          stockAfter: 60,
          userId: 'u1',
        }),
      });
      expect(tx.auditLog.create).toHaveBeenCalled();
    });

    it('OUT mengurangi stok', async () => {
      const res = await service.adjustStock(
        'u1',
        { productId: 'prod-1', type: 'OUT', quantity: 10, reason: 'rusak' } as any,
        null,
      );
      expect(res.currentStock).toBe(40);
    });

    it('menolak OUT yang membuat stok minus', async () => {
      await expect(
        service.adjustStock(
          'u1',
          { productId: 'prod-1', type: 'OUT', quantity: 51, reason: 'rusak' } as any,
          null,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('stockOpname', () => {
    it('mencatat selisih kurang sebagai ADJUSTMENT dan menyetel stok fisik', async () => {
      const res = await service.stockOpname(
        'u1',
        { productId: 'prod-1', countedStock: 45 } as any,
        null,
      );

      expect(res.systemStock).toBe(50);
      expect(res.countedStock).toBe(45);
      expect(res.difference).toBe(-5);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stock: 45 },
      });
      expect(tx.inventoryTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'ADJUSTMENT',
          quantity: 5,
          stockAfter: 45,
        }),
      });
    });

    it('mencatat selisih lebih', async () => {
      const res = await service.stockOpname(
        'u1',
        { productId: 'prod-1', countedStock: 58 } as any,
        null,
      );
      expect(res.difference).toBe(8);
      expect(tx.inventoryTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ quantity: 8, stockAfter: 58 }),
      });
    });

    it('tidak menulis apa pun kalau stok sudah cocok', async () => {
      const res = await service.stockOpname(
        'u1',
        { productId: 'prod-1', countedStock: 50 } as any,
        null,
      );
      expect(res.difference).toBe(0);
      expect(res.transaction).toBeNull();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
