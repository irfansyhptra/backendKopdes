import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { KopdesConsoleService } from './kopdes-console.service';

const admin = {
  id: 'a1',
  email: 'a',
  role: 'ADMIN_KOPDES' as const,
  kopdesId: 'k1',
  permissions: [],
};

describe('KopdesConsoleService', () => {
  let prisma: any;
  let storage: any;
  let service: KopdesConsoleService;

  beforeEach(() => {
    prisma = {
      product: {
        fields: { minStock: '<minStock>' },
        findMany: jest.fn(async () => [
          {
            id: 'p1',
            name: 'Beras',
            price: { toString: () => '65000' },
            discountPrice: null,
            stock: 3,
            minStock: 5,
            reviews: [{ rating: 5 }],
          },
        ]),
        count: jest
          .fn()
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(4)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(2),
      },
      koperasi: {
        findUnique: jest.fn(async () => ({ id: 'k1', operatingHours: null })),
        update: jest.fn(),
      },
      review: {
        aggregate: jest.fn(async () => ({
          _avg: { rating: 4.56 },
          _count: { _all: 9 },
        })),
      },
    };
    storage = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
    };
    service = new KopdesConsoleService(prisma, storage);
  });

  it('daftar produk: hanya Kopdes sendiri, menipis memakai minStock per produk', async () => {
    const res = await service.products(admin, { stockStatus: 'low' });
    const where = prisma.product.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ kopdesId: 'k1' });
    expect(where.AND[1]).toEqual({
      AND: [{ stock: { gt: 0 } }, { stock: { lte: '<minStock>' } }],
    });
    expect(res.summary).toEqual({ total: 7, safe: 4, low: 1, out: 2 });
    expect(res.lowStockThreshold).toBeNull();
    expect(res.products[0]).toMatchObject({
      price: 65000,
      minStock: 5,
      rating: 5,
    });
  });

  it('akun tanpa Kopdes ditolak', async () => {
    await expect(
      service.products({ ...admin, kopdesId: null }, {}),
    ).rejects.toThrow(ForbiddenException);
  });

  it('profil: status buka & rating; jam buka dinormalkan saat disimpan', async () => {
    const p = await service.profile(admin);
    expect(p).toMatchObject({ isOpen: null, rating: 4.6, reviewCount: 9 });
    await expect(
      service.updateProfile(admin, {
        operatingHours: { mon: { open: '7 pagi' } },
      }),
    ).rejects.toThrow(BadRequestException);
    await service.updateProfile(admin, {
      operatingHours: { mon: { open: '07:00', close: '17:00' } },
    });
    expect(
      prisma.koperasi.update.mock.calls[0][0].data.operatingHours.mon,
    ).toEqual({
      open: '07:00',
      close: '17:00',
    });
  });

  it('menyimpan logo dan banner Kopdes pada kolom media publik', async () => {
    prisma.koperasi.findUnique.mockResolvedValue({
      id: 'k1',
      logoUrl: 'https://old.test/logo.jpg',
      imageUrl: null,
      operatingHours: null,
    });
    storage.uploadFile
      .mockResolvedValueOnce('https://new.test/logo.jpg')
      .mockResolvedValueOnce('https://new.test/banner.jpg');

    await service.updateProfileMedia(admin, {
      logo: [{} as Express.Multer.File],
      banner: [{} as Express.Multer.File],
    });

    expect(prisma.koperasi.update).toHaveBeenCalledWith({
      where: { id: 'k1' },
      data: {
        logoUrl: 'https://new.test/logo.jpg',
        imageUrl: 'https://new.test/banner.jpg',
      },
    });
    expect(storage.deleteFile).toHaveBeenCalledWith(
      'https://old.test/logo.jpg',
    );
  });

  it('dasbor: "hari ini" dimulai tengah malam WIB, omzet hanya barang Kopdes', async () => {
    prisma.orderItem = {
      findMany: jest.fn(async () => [
        { quantity: 2, price: { toString: () => '10000' } },
      ]),
      aggregate: jest.fn(async () => ({ _sum: { quantity: 7 } })),
    };
    prisma.order = { count: jest.fn(async () => 3) };
    prisma.product.count = jest.fn(async () => 4);
    prisma.uMKM = { count: jest.fn(async () => 1) };
    prisma.uMKMPayout = { count: jest.fn(async () => 2) };

    // 01.30 WIB tanggal 5 = 18.30 UTC tanggal 4.
    const res = await service.dashboard(
      admin,
      new Date('2026-10-04T18:30:00Z'),
    );
    const firstFrom =
      prisma.orderItem.findMany.mock.calls[0][0].where.order.createdAt.gte;
    expect(firstFrom.toISOString()).toBe('2026-10-04T17:00:00.000Z');
    expect(prisma.orderItem.findMany.mock.calls[0][0].where.product).toEqual({
      kopdesId: 'k1',
    });
    expect(res).toMatchObject({
      todayEarnings: 20000,
      productsSold: 7,
      storeRating: 4.6,
      pendingMitra: 1,
      pendingPayouts: 2,
    });
  });
});
